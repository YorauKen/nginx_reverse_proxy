import cluster, { Worker } from "node:cluster";
import http from "node:http";
import { ConfigSchemaType, rootConfigSchema } from "./config-schema";
import {
  workerMessageSchema,
  WorkerMessageType,
  WorkerMessageReplyType,
  workerMessageReplySchema,
} from "./server-schema";

interface CreateServerConfig {
  port: number;
  workerCount: number;
  config: ConfigSchemaType;
}

export async function createServer(config: CreateServerConfig) {
  const { workerCount, port } = config;
  // the workers that are under the master process
  const WORKER_POOL: Worker[] = [];

  if (cluster.isPrimary) {   // Master Process
    console.log("Master Process is Up 🚀");

    for (let i = 0; i < workerCount; i++) {
      const w = cluster.fork({ config: JSON.stringify(config.config) });
      WORKER_POOL.push(w);
      console.log(`Master Process is spinning up worker process: ${i}`);
    }

    const server = http.createServer((req, res) => {

      res.setHeader("Access-Control-Allow-Origin", "*"); // Allow all origins
      const index = Math.floor(Math.random() * WORKER_POOL.length);
      console.log(`Worker selected : ${index}`);
      const worker = WORKER_POOL.at(index);

      if (!worker) throw new Error("Worker Not Found!!!");

      // initial incoming request to proxy server is being made as payload to one of the workers
      // this payload acts as message
      const payload: WorkerMessageType = {
        requestType: "HTTP",
        headers: req.headers,
        body: null,
        url: `${req.url}`,
      };
      // sending the request to worker
	    worker.send(JSON.stringify(payload));
      
      // after the worker does its job it replies back 
	    worker.on("message", async (workerReply: string) => {
          // validating the response from the worker
          const reply = await workerMessageReplySchema.parseAsync(
            JSON.parse(workerReply)
          );
          console.log(reply); 
          
          // writing the response back to client error or success
          if (reply.errorCode) {
            res.writeHead(parseInt(reply.errorCode));
            res.end(reply.error);
            return;
          } else {
            res.writeHead(200);
            res.end(reply.data);
            return;
          }
        });
      } );
      //Serven is Up here
      server.listen(port, function () {
        console.log(
          `Reverse Proxy Server is Up !!!🚀🚀🚀 and listening on PORT : ${port}`
        );
      });
	
  } else {
    console.log(`Worker Node 🚀`);
    // worker needs to parse the config files to access the rules set
    const config = await rootConfigSchema.parseAsync(
      JSON.parse(`${process.env.config}`)
    );
    
    //  worker listens for messages from the master process via the "message event"
    process.on("message", async (message: string) => {
      const messageValidated = await workerMessageSchema.parseAsync(
        JSON.parse(message)
      );
      const requestURL = messageValidated.url;
      // find a matching rule for the incoming request URL.
      // It determines the upstream server to forward the request to.
      const rule = config.server.rules.find((e) => {
        const regex = new RegExp(`^${e.path}.*$`);
        return regex.test(requestURL);
      });
      
      // Error case , If there is no matching rule/requestURL
      if (!rule) {
        const reply: WorkerMessageReplyType = {
          errorCode: "404",
          error: "Rule not found",
        };
        if (process.send) return process.send(JSON.stringify(reply));
      }

      // selecting the upstream based on rule
      const upstreamID = rule?.upstreams[0];
      const upstream = config.server.upstreams.find((e) => e.id === upstreamID);
      if (!upstream) {
        const reply: WorkerMessageReplyType = {
          errorCode: "500",
          error: "Upstream not found",
        };
        if (process.send) return process.send(JSON.stringify(reply));
      }
      
      // finally the request is from the worker or the intended job 
      const request = http.request(
        {
          host: upstream?.url,
          path: requestURL,
          method: "GET",
        },
        (proxyResponse) => {
          let body = "";
          proxyResponse.on("data", (chunk) => {
            body += chunk;
          });

          proxyResponse.on("end", () => {
            const reply: WorkerMessageReplyType = {
              data: body,
            };
            if (process.send) return process.send(JSON.stringify(reply));
          });
        }
      );

      request.end();
    });
  }
}
