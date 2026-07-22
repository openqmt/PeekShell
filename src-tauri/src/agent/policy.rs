//! 执行模式策略与本地危险命令启发式。

use super::schema::{ExecMode, RiskLevel};

pub enum ExecAction {
    AutoExecute,
    RequireConfirm,
}

/// 根据模式与风险决定是否可自动执行。
pub fn decide_action(mode: ExecMode, risk: RiskLevel) -> ExecAction {
    match mode {
        ExecMode::Auto => ExecAction::AutoExecute,
        ExecMode::Confirm => ExecAction::RequireConfirm,
        ExecMode::Smart => match risk {
            RiskLevel::Low => ExecAction::AutoExecute,
            RiskLevel::Medium | RiskLevel::High => ExecAction::RequireConfirm,
        },
    }
}

/// 用本地启发式抬升风险，防止模型低估破坏性命令。
pub fn elevate_risk(command: &str, reported: RiskLevel) -> RiskLevel {
    let lower = command.to_lowercase();
    let high_patterns = [
        "rm -rf",
        "rm -fr",
        "rm -r /",
        "mkfs",
        "dd if=",
        "wipefs",
        "shutdown",
        "reboot",
        "init 0",
        "init 6",
        "halt",
        "poweroff",
        "iptables -f",
        "iptables --flush",
        "ufw --force reset",
        "drop table",
        "truncate table",
        "curl | sh",
        "curl|sh",
        "wget | sh",
        "wget|sh",
        "| bash",
        "|bash",
        ":(){",
        "chmod -r 777 /",
        "chown -r",
        "> /dev/sd",
        "of=/dev/sd",
    ];
    if high_patterns.iter().any(|p| lower.contains(p)) {
        return RiskLevel::High;
    }
    // 写系统配置目录倾向高危
    if (lower.contains(">/etc/") || lower.contains("> /etc/") || lower.contains("tee /etc/"))
        && !lower.contains("cat /etc/")
    {
        return RiskLevel::High;
    }
    reported
}
