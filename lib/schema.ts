import type { StandardSchemaV1 } from "@standard-schema/spec";

/**
 * Checks for validators compatible with Standard Schema V1.
 */
export function isStandardSchema(schema: any): schema is StandardSchemaV1 {
  return schema['~standard'] ? true : false
} 
