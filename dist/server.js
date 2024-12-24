"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createServer = createServer;
const node_cluster_1 = __importDefault(require("node:cluster"));
const node_http_1 = __importDefault(require("node:http"));
const config_schema_1 = require("./config-schema");
const server_schema_1 = require("./server-schema");
function createServer(config) {
    return __awaiter(this, void 0, void 0, function* () {
        const { workerCount, port } = config;
        // the workers that are under the master process
        const WORKER_POOL = [];
        if (node_cluster_1.default.isPrimary) { // Master Process
            console.log("Master Process is Up 🚀");
            for (let i = 0; i < workerCount; i++) {
                const w = node_cluster_1.default.fork({ config: JSON.stringify(config.config) });
                WORKER_POOL.push(w);
                console.log(`Master Process is spinning up worker process: ${i}`);
            }
            const server = node_http_1.default.createServer((req, res) => {
                res.setHeader("Access-Control-Allow-Origin", "*"); // Allow all origins
                const index = Math.floor(Math.random() * WORKER_POOL.length);
                console.log(`Worker selected : ${index}`);
                const worker = WORKER_POOL.at(index);
                if (!worker)
                    throw new Error("Worker Not Found!!!");
                // initial incoming request to proxy server is being made as payload to one of the workers
                // this payload acts as message
                const payload = {
                    requestType: "HTTP",
                    headers: req.headers,
                    body: null,
                    url: `${req.url}`,
                };
                // sending the request to worker
                worker.send(JSON.stringify(payload));
                // after the worker does its job it replies back 
                worker.on("message", (workerReply) => __awaiter(this, void 0, void 0, function* () {
                    // validating the response from the worker
                    const reply = yield server_schema_1.workerMessageReplySchema.parseAsync(JSON.parse(workerReply));
                    console.log(reply);
                    // writing the response back to client error or success
                    if (reply.errorCode) {
                        res.writeHead(parseInt(reply.errorCode));
                        res.end(reply.error);
                        return;
                    }
                    else {
                        res.writeHead(200);
                        res.end(reply.data);
                        return;
                    }
                }));
            });
            //Serven is Up here
            server.listen(port, function () {
                console.log(`Reverse Proxy Server is Up !!!🚀🚀🚀 and listening on PORT : ${port}`);
            });
        }
        else {
            console.log(`Worker Node 🚀`);
            // worker needs to parse the config files to access the rules set
            const config = yield config_schema_1.rootConfigSchema.parseAsync(JSON.parse(`${process.env.config}`));
            //  worker listens for messages from the master process via the "message event"
            process.on("message", (message) => __awaiter(this, void 0, void 0, function* () {
                const messageValidated = yield server_schema_1.workerMessageSchema.parseAsync(JSON.parse(message));
                const requestURL = messageValidated.url;
                // find a matching rule for the incoming request URL.
                // It determines the upstream server to forward the request to.
                const rule = config.server.rules.find((e) => {
                    const regex = new RegExp(`^${e.path}.*$`);
                    return regex.test(requestURL);
                });
                // Error case , If there is no matching rule/requestURL
                if (!rule) {
                    const reply = {
                        errorCode: "404",
                        error: "Rule not found",
                    };
                    if (process.send)
                        return process.send(JSON.stringify(reply));
                }
                // selecting the upstream based on rule
                const upstreamID = rule === null || rule === void 0 ? void 0 : rule.upstreams[0];
                const upstream = config.server.upstreams.find((e) => e.id === upstreamID);
                if (!upstream) {
                    const reply = {
                        errorCode: "500",
                        error: "Upstream not found",
                    };
                    if (process.send)
                        return process.send(JSON.stringify(reply));
                }
                // finally the request is from the worker or the intended job 
                const request = node_http_1.default.request({
                    host: upstream === null || upstream === void 0 ? void 0 : upstream.url,
                    path: requestURL,
                    method: "GET",
                }, (proxyResponse) => {
                    let body = "";
                    proxyResponse.on("data", (chunk) => {
                        body += chunk;
                    });
                    proxyResponse.on("end", () => {
                        const reply = {
                            data: body,
                        };
                        if (process.send)
                            return process.send(JSON.stringify(reply));
                    });
                });
                request.end();
            }));
        }
    });
}
