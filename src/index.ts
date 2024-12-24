import { program } from "commander";
import os from "node:os";
import { parseYAMLConfig, validateConfig } from "./config";
import { createServer } from "./server";

async function main() {
  // when executing the program we pass the command line argument the congig.yaml path , so to identify we are using this path and command line parser
  program.option("--config <path>");
  program.parse();

  const options = program.opts(); // options => { config : 'config.yaml' }
  if (options && "config" in options) {
	// all the config file validation is done using zod validator package , 
	// the corresponding schema validation in terms of zod representation in there `config-schema.ts` and `server-schema.ts`
    const validatedConfig = await validateConfig(
      await parseYAMLConfig(options.config)
    );
	// Proxy Reverse Server
    await createServer({
      port: validatedConfig.server.listen,
      workerCount: validatedConfig.server.workers ?? os.cpus().length,
      config: validatedConfig,
    });
  }
}

main();
