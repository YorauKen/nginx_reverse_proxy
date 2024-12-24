import fs from "node:fs/promises";
import {parse} from 'yaml'
import { rootConfigSchema } from "./config-schema";

/**
 * This function takes in filepath of yaml file 
 * converts file to Object , Object to JSON
 * JSON to string
 * @param filepath 
 * @returns the string of parsed yaml
 */
export async function parseYAMLConfig(filepath:string) {
	const configFileContent = await fs.readFile(filepath,'utf-8');	
	const configParsed = parse(configFileContent);
	return JSON.stringify(configParsed);
}

export async function validateConfig(config:string) {
	const validatedConfig = await rootConfigSchema.parseAsync(JSON.parse(config));
	return validatedConfig;
}