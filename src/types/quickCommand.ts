/** 终端快捷命令（本地持久化）。 */

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
  group: string;
}

export interface QuickCommandsState {
  /** 分组顺序（可含空分组） */
  groups: string[];
  commands: QuickCommand[];
}
