// 源: arc-core/src/arc/util/ArcRuntimeException.java (arc.math 所需的最小等价实现)
// 迁移说明: Java RuntimeException 在 TS 中对应 Error。保留异常消息文本。
// TODO: 迁移到 arc.util.ArcRuntimeException 统一实现
export class ArcRuntimeException extends Error{
    constructor(message: string){
        super(message);
        this.name = 'ArcRuntimeException';
    }
}
