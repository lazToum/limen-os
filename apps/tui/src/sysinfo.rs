//! System information collector — CPU, memory, disk, network.

use sysinfo::{Disks, Networks, System};

#[derive(Clone, Debug, Default)]
pub struct SysSnapshot {
    pub cpu_pct: f32,
    pub cpu_cores: usize,
    pub mem_used_gib: f64,
    pub mem_total_gib: f64,
    pub disk_used_pct: f64,
    pub disk_total_gib: f64,
    /// Bytes received since last tick.
    pub net_down_bps: f64,
    /// Bytes transmitted since last tick.
    pub net_up_bps: f64,
    pub hostname: String,
    pub uptime_secs: u64,
    pub load1: f64,
    pub load5: f64,
    pub load15: f64,
}

pub struct SysCollector {
    sys: System,
    nets: Networks,
    prev_recv: u64,
    prev_sent: u64,
}

impl SysCollector {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_cpu_all();
        sys.refresh_memory();
        let mut nets = Networks::new_with_refreshed_list();
        nets.refresh(true);
        let (prev_recv, prev_sent) = sum_net(&nets);
        Self {
            sys,
            nets,
            prev_recv,
            prev_sent,
        }
    }

    /// Collect a fresh snapshot. Call at most once per second for accurate net delta.
    pub fn collect(&mut self) -> SysSnapshot {
        self.sys.refresh_cpu_all();
        self.sys.refresh_memory();
        self.nets.refresh(true);

        let cpu_pct = self.sys.global_cpu_usage();
        let cpu_cores = self.sys.cpus().len();
        let mem_used = self.sys.used_memory() as f64 / GIB;
        let mem_total = self.sys.total_memory() as f64 / GIB;

        let (recv, sent) = sum_net(&self.nets);
        let net_down = recv.saturating_sub(self.prev_recv) as f64;
        let net_up = sent.saturating_sub(self.prev_sent) as f64;
        self.prev_recv = recv;
        self.prev_sent = sent;

        let disks = Disks::new_with_refreshed_list();
        let (disk_used_pct, disk_total_gib) = disks
            .iter()
            .find(|d| d.mount_point() == std::path::Path::new("/"))
            .map(|d| {
                let total = d.total_space() as f64 / GIB;
                let avail = d.available_space() as f64 / GIB;
                let pct = if total > 0.0 {
                    (1.0 - avail / total) * 100.0
                } else {
                    0.0
                };
                (pct, total)
            })
            .unwrap_or((0.0, 0.0));

        let load = System::load_average();

        SysSnapshot {
            cpu_pct,
            cpu_cores,
            mem_used_gib: mem_used,
            mem_total_gib: mem_total,
            disk_used_pct,
            disk_total_gib,
            net_down_bps: net_down,
            net_up_bps: net_up,
            hostname: System::host_name().unwrap_or_else(|| "limen".into()),
            uptime_secs: System::uptime(),
            load1: load.one,
            load5: load.five,
            load15: load.fifteen,
        }
    }
}

const GIB: f64 = 1024.0 * 1024.0 * 1024.0;

fn sum_net(nets: &Networks) -> (u64, u64) {
    nets.iter().fold((0u64, 0u64), |(r, s), (_, n)| {
        (r + n.total_received(), s + n.total_transmitted())
    })
}

pub fn format_speed(bps: f64) -> String {
    if bps >= 1024.0 * 1024.0 {
        format!("{:.1} MiB/s", bps / 1024.0 / 1024.0)
    } else if bps >= 1024.0 {
        format!("{:.1} KiB/s", bps / 1024.0)
    } else {
        format!("{:.0} B/s", bps)
    }
}

pub fn format_uptime(secs: u64) -> String {
    let days = secs / 86400;
    let hours = (secs % 86400) / 3600;
    let mins = (secs % 3600) / 60;
    if days > 0 {
        format!("{}d {}h {}m", days, hours, mins)
    } else if hours > 0 {
        format!("{}h {}m", hours, mins)
    } else {
        format!("{}m", mins)
    }
}
