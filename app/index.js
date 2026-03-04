const express = require("express");

// Node's TCP networking module - Logstash listening on TCP 5000
const net = require("net");

// Pino - logging library - to generate JSON logs
//JSON logs - for log aggregation (Logstash and Elasticsearch)
const pino = require("pino");

// Middleware to automatically log HTTP req/res
// auto logging things like
// - HTTP method & headers
// - URL
// - Response Status & Time
const pinoHttp = require("pino-http");

// To generate unique request IDs
// so logs for that request can be traced
const { v4: uuid } = require("uuid");

// create express application
const app = express();

// Logstash HOST_NAME and PORT
// docker will create DNS for service as 'logstash'
// we can reach logstash via - logstash:5000
const LOGSTASH_HOST = process.env.LOGSTASH_HOST || "logstash";
const LOGSTASH_PORT = Number(process.env.LOGSTASH_PORT || 5000);

// TCP connection to Logstash
//
// Log flow:
// Node App -> Logstash -> Elasticsearch -> Kibana
const socket = net.createConnection({
  host: LOGSTASH_HOST,
  port: LOGSTASH_PORT,
});

// Callback that runs when we estaablish TCP connection to logstash
socket.on("connect", () =>
  console.log("connected to logstash:", LOGSTASH_HOST, LOGSTASH_PORT),
);

// Callback that runs on an error event
// like: ERRCONNREFUSED - (logstash wasn't ready)
socket.on("error", (err) =>
  console.error("logstash socket error:", err.message),
);

// pino logger - to create JSON logs - convenient for aggreggation
// pino signature - pino(options, destination)
//
// Instead of writing logs to console - we send them to Logstash via TCP
// via -> [(msg) => socket.write()]
const logger = pino(
  // level: 'info' - min log level
  // these will appear: info/warn/error/fatal
  // these will not: debug/trace
  {
    level: "info",
  },
  // pino internally does - destination.write(<MESSAGE>)
  //
  // socket can write as continous string [{"msg": home} {"msg": done}
  // as TCP is a byte stream (does not guarantee one packet or one write)
  //
  // (codec => json_lines) [DELIMITER IS \n for logs]
  // so we attach \n in end
  {
    write: (msg) => socket.write(msg.endsWith("\n") ? msg : msg + "\n"),
  },
);

// HTTP logging middleware - intercepts every request
// Attach logger to the requests u intercept
// genReqId -> creates unique request ID (header-requestId/uuid())
// customLogLevel - decides WHAT log level to use
//  - if our response has 500 status code - log level - "error"
//  - if our response has >= 400 status - log level - "warn"
//  - otherwise it's "info"
//
// PINO HTTP ALSO ADDS ADDITIONAL FIELDS
//
// AUTOMATICALLY LOGS WHEN REQUEST IS FINISHED eg:
// custom log level will attach type: <TYPE>
// {
//   "msg": "request completed" / "request errored",
//   "res.statusCode": 200,
//   "responseTime": 1
// }
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.headers["x-request-id"] || uuid(),
    customLogLevel: (_, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
  }),
);

// HOME ENDPOINT - TO LOG INFO
app.get("/", (req, res) => {
  // pinoHttp middleware attaches 'log' to request object
  // now to log we jsut do req.log.<level>({ JSON log })
  req.log.info({ route: "/", msg: "home hit" });

  res.status(200).send("HOME ENDPOINT HERE!! :-)");
});

// ERROR ENDPOINT - TO LOG ERROR
app.get("/error", (req, res) => {
  // logging again!!
  req.log.error({ route: "/error", msg: "forced error demo" });
  res.status(500).send("ERRORR!!!! [dw just a demo error ;-)]");
});

// OUR DEMO APP RUNS ON 3000 PORT!!!!
app.listen(3000, () => console.log("server on :3000"));
