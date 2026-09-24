// 源: annotations/src/main/java/mindustry/annotations/Annotations.java
//
// 迁移说明: Java 侧这些是注解处理器（EntityProcess / StructProcess）的输入标记；注解处理器
// 在 TS 里被替换成构建期程序 `@mindustry-ts/codegen`（S2）。因此本文件在**运行期全部是 no-op**：
// 所有真实行为（角色接口、合并实体类、group 索引、struct 打包）都由 codegen 生成。
//
// codegen 只按「装饰器标识符名字」识别（`codegen.ts:145` hasDecorator），所以这里的
// 名字必须与 `codegen/fixtures/decorators.ts` 逐字一致。签名也保持一致，否则 `tsc`
// 会在 `.def.ts` 源文件上抛错（`.def.ts` 已经从 tsconfig 里排除，见 package tsconfig）。
//
// 与 fixture 版的唯一差别: 本文件是运行时包的一部分，供 `src/entities/**/*.def.ts` 引用。

export interface ComponentOptions{
  /** Java `Component.base()`: 可见字段进入生成的抽象基类。默认 false。 */
  base?: boolean;
  /**
   * Java `Component.genInterface()`: false 时不发射角色接口。
   *
   * 注意 Java 在这种情况下**仍**会写一个空接口（`EntityProcess.java:172` 的写法在
   * `genInterface()` 判断之外）；S2 有意不写（见计划 §5.6）。
   */
  genInterface?: boolean;
}

/** 标记一个类为实体组件。 */
export function Component(options?: ComponentOptions): ClassDecorator{
  void options;
  return () => {};
}

export interface EntityDefOptions{
  /**
   * 实体类名。**TS 中必填**。
   *
   * Java 只能从组件接口名推导，因为 `@EntityDef.value()` 是 `Class[]`、没有名字槽位；
   * TS 装饰器可以携带任意数据。`nameRule.deriveEntityName` 仍然复刻 Java 的规则，
   * 且 `entityGen` 会断言「声明名 === 推导名」。
   */
  name: string;
  /** 参与合并的组件接口，例如 `[Unitc, Mechc]`。 */
  components: readonly unknown[];
  /** Java `EntityDef.isFinal()`。TS class 无 final，仅记录。 */
  isFinal?: boolean;
  /** Java `EntityDef.pooled()`: 实体通过 `Pools` 复用。 */
  pooled?: boolean;
  /** 生成的 `serialize()` 返回值。默认 true。 */
  serialize?: boolean;
  /** Java `EntityDef.genio()`。S2/S3 不生成 IO。默认 true。 */
  genio?: boolean;
  /** Java `EntityDef.legacy()`: 发射一个保留旧 class id 的 legacy 分支类。 */
  legacy?: boolean;
  /** 按名字排除的 group，例如 `["all"]`。 */
  excludeGroups?: readonly string[];
}

/** 标记一个实体定义。可用于类，或（legacy 类型）用于字段。 */
export function EntityDef(options: EntityDefOptions): ClassDecorator & PropertyDecorator{
  void options;
  return () => {};
}

export interface GroupDefOptions{
  /** 必须同时具备的组件接口。 */
  value: readonly unknown[];
  /** 具备即排除的组件接口。 */
  exclude?: readonly unknown[];
  collide?: boolean;
  spatial?: boolean;
  mapping?: boolean;
  update?: boolean;
}

/** 声明一个实体 group。 */
export function GroupDef(options: GroupDefOptions): ClassDecorator & PropertyDecorator{
  void options;
  return () => {};
}

export interface SyncFieldOptions{
  /** Java `SyncField.clamped()`: 把插值后的值 clamp 到 0-1。 */
  clamped?: boolean;
}

/** 标记一个字段为同步字段。Java 要求 `float`；TS 要求 `number`。 */
export function SyncField(value: boolean, options?: SyncFieldOptions): PropertyDecorator{
  void value;
  void options;
  return () => {};
}

/** 标记一个实现会替换同签名实现。 */
export function Replace(target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void{
  void target;
  void propertyKey;
  void descriptor;
}

/** 合并方法时的优先级；越大越优先。 */
export function MethodPriority(value: number): MethodDecorator{
  void value;
  return () => {};
}

/** 把字段发射为 `readonly` 并跳过其 setter。 */
export function ReadOnly(): PropertyDecorator & MethodDecorator{
  return () => {};
}

/** 声明字段由其他组件持有；不发射任何字段。 */
export function Import(): PropertyDecorator{
  return () => {};
}

/** 标记一个类为打包值类型。类名必须以 `Struct` 结尾。 */
export function Struct(): ClassDecorator{
  return () => {};
}

/** 覆盖 struct 字段的位宽。 */
export function StructField(bits: number): PropertyDecorator{
  void bits;
  return () => {};
}

/** Java `Annotations.NoPatch`: 数据补丁不得改动的字段/类。运行期 no-op。 */
export function NoPatch(target: object, propertyKey?: string | symbol): void{
  void target;
  void propertyKey;
}

/** Java `Annotations.CallSuper`: 覆写时必须调 super。运行期 no-op。 */
export function CallSuper(target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void{
  void target;
  void propertyKey;
  void descriptor;
}

/** Java `Annotations.InternalImpl` / `Final` / `OverrideCallSuper` 占位。运行期 no-op。 */
export function InternalImpl(target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void{
  CallSuper(target, propertyKey, descriptor);
}

/** Java `Annotations.Final`。运行期 no-op。 */
export function Final(target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void{
  CallSuper(target, propertyKey, descriptor);
}

/** Java `Annotations.OverrideCallSuper`。运行期 no-op。 */
export function OverrideCallSuper(target: object, propertyKey: string | symbol, descriptor?: PropertyDescriptor): void{
  CallSuper(target, propertyKey, descriptor);
}

/** Java `Annotations.BaseComponent`: 注入到每个组件的依赖闭包。运行期 no-op。 */
export function BaseComponent(target: object): void{
  void target;
}
