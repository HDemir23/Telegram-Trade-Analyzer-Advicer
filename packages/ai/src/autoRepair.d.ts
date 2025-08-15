import { ZodSchema } from 'zod';
import { AiOutput } from './schema';
/**
 * Executes a prompt and attempts to auto-repair the output to conform to a Zod schema.
 * It includes a retry loop for schema validation and applies clamping and sanity checks.
 *
 * @param text The raw text output from the AI.
 * @param schema The Zod schema to validate against.
 * @returns A promise that resolves to the validated and repaired data.
 * @throws {Error} If validation and repair fail after all retries.
 */
export declare function autoRepair<T = AiOutput>(text: string, schema?: ZodSchema<T>): Promise<T>;
//# sourceMappingURL=autoRepair.d.ts.map