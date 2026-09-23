export { collectModels, commonRoot, generate, CollectError } from "./codegen.js";
export type { GenerateOptions, SourceModel } from "./codegen.js";
export { main } from "./cli.js";
export type { CliOptions } from "./cli.js";
export {
  DEFAULT_CONFIG,
  DEFAULT_GROUPS,
  JAVA_CLASS_IDS_RELATIVE,
  NAME_RULES,
  defaultConfig,
  loadClassIds,
  nextClassId,
  parseClassIds,
  repositoryRoot,
} from "./config.js";
export type { CodegenConfig, GroupConfig, NameRules } from "./config.js";
export type {
  ComponentFieldModel,
  ComponentMethodModel,
  ComponentModel,
  EntityDefModel,
} from "./model.js";
export {
  EntityGenError,
  definitionKey,
  generateEntityFiles,
  mergeMethods,
  resolveEntities,
} from "./entity/entityGen.js";
export type { EntityGenInput, MergedMethod, ResolvedEntity } from "./entity/entityGen.js";
export { GroupGenError, generateGroupFiles } from "./entity/groupGen.js";
export {
  assignClassIds,
  camelToKebab,
  generateEntityMappingFile,
  nameAliases,
} from "./entity/entityMappingGen.js";
export type { NameAlias } from "./entity/entityMappingGen.js";
export {
  NameRuleError,
  baseNameFor,
  capitalize,
  createName,
  deriveEntityName,
  interfaceNameFor,
  interfaceToCompName,
} from "./entity/nameRule.js";
export type { EntityNameInput } from "./entity/nameRule.js";
export {
  StructGenError,
  bitString,
  defaultBits,
  generateStructFiles,
  totalSizeFor,
  valueBitString,
} from "./struct/structGen.js";
export type { StructFieldModel, StructModel } from "./struct/structGen.js";
