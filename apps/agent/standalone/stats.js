import si from 'systeminformation';
export async function collectStats() {
    try {
        const [cpu, mem, disk, net, time] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.networkStats(),
            si.time(),
        ]);
        const mainDisk = disk[0] ?? { used: 0, size: 1 };
        const mainNet = net[0] ?? { rx_sec: 0, tx_sec: 0 };
        return {
            cpuPercent: Math.round(cpu.currentLoad),
            memUsedMb: Math.round(mem.used / 1024 / 1024),
            memTotalMb: Math.round(mem.total / 1024 / 1024),
            diskUsedGb: Math.round(mainDisk.used / 1024 / 1024 / 1024),
            diskTotalGb: Math.round(mainDisk.size / 1024 / 1024 / 1024),
            uptimeSeconds: Math.round(time.uptime),
            networkRxBps: mainNet.rx_sec ?? 0,
            networkTxBps: mainNet.tx_sec ?? 0,
        };
    }
    catch (err) {
        console.warn('[stats] failed to collect stats:', err);
        return {
            cpuPercent: 0,
            memUsedMb: 0,
            memTotalMb: 0,
            diskUsedGb: 0,
            diskTotalGb: 0,
            uptimeSeconds: 0,
            networkRxBps: 0,
            networkTxBps: 0,
        };
    }
}
//# sourceMappingURL=stats.js.map