// 源: core/src/mindustry/net/Net.java (mindustry.Vars.net 的类型; 无 arc 侧对应类)
//
// 迁移说明: headless 服务器在 S1 阶段尚未接入网络层, 但 Vars.net 在 Java 里是全局单例且被
// 大量代码直接调用 (仅静态使用点就有 active()/server()/client()), 因此需要一个带稳定身份的
// 对象 —— 绝不能是 undefined (对齐 §11 类别 A「身份稳定存根」)。
// 本类只保留查询面与 no-op 动作; 真实实现 (ArcNet provider / 序列化 / 连接管理) 留待网络阶段。
import type { Seq } from "../struct/Seq";

/** 无操作网络层存根。对应 mindustry.net.Net 查询/动作面。 */
export class MockNet{
  /** @return 是否有活动的 client 或 server 连接。对应 Net.active()。 */
  active(): boolean{
    return false;
  }

  /** @return 是否作为服务器运行。对应 Net.server()。 */
  server(): boolean{
    return false;
  }

  /** @return 是否作为客户端运行。对应 Net.client()。 */
  client(): boolean{
    return false;
  }

  getConnections(): Seq<unknown> | null{
    return null;
  }

  setClientLoaded(_loaded: boolean): void{
  }

  setClientConnected(): void{
  }

  reset(): void{
  }

  connect(_ip: string, _port: number, _success: () => void): void{
  }

  host(_port: number): void{
  }

  closeServer(): void{
  }

  disconnect(): void{
  }

  send(_object: unknown, _reliable: boolean): void{
  }

  dispose(): void{
  }
}
