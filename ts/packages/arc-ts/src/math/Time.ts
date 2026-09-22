// 源: arc-core/src/arc/util/Time.java (arc.math 所需的最小等价实现)
// 迁移说明: 仅移植 arc.math 使用的静态字段 Time.time / Time.delta。
// TODO: 迁移到 arc.util.Time 统一实现
export const Time = {
    /** 全局时间（秒）。 */
    time: 0,
    /** 上一帧时长（秒）。 */
    delta: 1,
};
