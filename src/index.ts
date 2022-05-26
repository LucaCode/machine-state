/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import * as os from 'os';
import * as fs from "fs";
import co from 'co';
import {cpus, platform} from "os";
import {machineId} from "./machineId";
const cp = require('child_process');
const pidUsage = require('pidusage');
import * as drivelist from "drivelist";
import checkDiskSpace from 'check-disk-space'

export default class MachineState {

    static async getGeneralInfo(): Promise<object> {
        const cpusInfo = cpus();
        return {
            machineId: MachineState.machineId,
            cpuModel: cpusInfo[0].model,
            cpuCount: cpusInfo.length,
            platform: platform(),
            os: await MachineState.getOs()
        };
    }

    static async getResourceUsageInfo(): Promise<object>
    {
        const [pidUsage,storage,cpuUsage,memMb] = await Promise.all([
            MachineState.getPidInfo(),
            MachineState.getStorageInfo(),
            MachineState.getAverageCpuUsage(),
            MachineState.getMemoryUsage()
        ]);
        return {
            machine: {
                storage,
                memory: {totalMemMb: memMb.totalMemMb, usedMemMb: memMb.usedMemMb},
                cpu: cpuUsage
            },
            process: pidUsage
        };
    }

    static get machineId() {
        return machineId;
    }

    static async getStorageInfo(): Promise<{ size: number, used: number, usedPercentage: number }> {
        try {
            let sizeSum = 0, freeSum = 0;
            if(process.platform !== 'win32') {
                const space = await checkDiskSpace('/');
                sizeSum += space.size;
                freeSum += space.free;
            }
            else {
                const drives = await MachineState.getWindowsDrives();
                await Promise.all(drives.map(async drive => {
                    const space = await checkDiskSpace(drive);
                    sizeSum += space.size;
                    freeSum += space.free;
                }));
            }
            const used = sizeSum - freeSum;
            return {
                size: sizeSum,
                used,
                usedPercentage: sizeSum <= 0 ? 0 :
                    (Math.round(((used / sizeSum) * 100) * 100) / 100)
            };
        } catch (e) {return {size: 0, used: 0, usedPercentage: 0};}
    }

    static async getWindowsDrives(): Promise<string[]> {
        try {
            const driveNames: string[] = [];
            const drives = await drivelist.list();
            for(const drive of drives) {
                for(const mountPoint of drive.mountpoints) {
                    const path = mountPoint.path;
                    if(path.indexOf(":") === -1 || driveNames.includes(path)) continue;
                    driveNames.push(path);
                }
            }
            return driveNames;
        }
        catch(_) {return ['C:'];}
    }

    static getAverageCpuUsage(): Promise<number> {
        return new Promise((resolve) => {
            const startMeasure = MachineState.processAverageCpuUsage();
            setTimeout(() => {
                const endMeasure = MachineState.processAverageCpuUsage();
                const idleDifference = endMeasure.avgIdle - startMeasure.avgIdle;
                const totalDifference = endMeasure.avgTotal - startMeasure.avgTotal;
                const cpuPercentage = (10000 - Math.round(10000 * idleDifference / totalDifference)) / 100;
                return resolve(cpuPercentage)
            }, 1000);
        })
    }

    static getMemoryUsage() {
        return new Promise<{totalMemMb: number,usedMemMb: number}>(resolve => {
            let totalMem: any = null, freeMem: any = null;
            cp.exec('cat /proc/meminfo | head -5', co.wrap(function* (err, out) {
                if (err || !out) {
                    totalMem = os.totalmem() / 1024;
                    freeMem = os.freemem() / 1024;
                    if (os.platform() === 'darwin') {
                        const mem = yield MachineState.darwinMem.memory();
                        totalMem = mem.total;
                        freeMem = mem.total - mem.used
                    }
                } else {
                    const resultMemory = (out.match(/\d+/g));
                    totalMem = parseInt(resultMemory[0], 10) * 1024;
                    freeMem = parseInt(resultMemory[1], 10) + (parseInt(resultMemory[3], 10) +
                        parseInt(resultMemory[4], 10)) * 1024
                }
                return resolve({
                    totalMemMb: parseFloat((totalMem / 1024 / 1024).toFixed(2)),
                    usedMemMb: parseFloat(((totalMem - freeMem) / 1024 / 1024).toFixed(2)),
                })
            }))
        })
    }

    private static processAverageCpuUsage() {
        let totalIdle = 0, totalTick = 0;
        const cpus = os.cpus();
        for (let i = 0, len = cpus.length; i < len; i++) {
            const cpu = cpus[i];
            for (let type in cpu.times) {
                totalTick += cpu.times[type]
            }
            totalIdle += cpu.times.idle
        }
        return {
            totalIdle: totalIdle,
            totalTick: totalTick,
            avgIdle: (totalIdle / cpus.length),
            avgTotal: (totalTick / cpus.length)
        }
    }

    private static exec(command) {
        return function () {
            return new Promise(function (resolve) {
                cp.exec(command, {shell: true}, function (err, stdout) {
                    if (err || !stdout) {
                        return resolve('Unknown');
                    }
                    return resolve(stdout);
                })
            })
        }
    }

    static getOs(): Promise<string> {
        const platform = os.platform();
        if (platform === 'linux') return MachineState.getOsLinux()
        else if (platform === 'darwin') return MachineState.getOsDarwin();
        else if(platform === 'win32') return MachineState.getOsWin();
        return MachineState.getOsLast();
    }

    private static getOsLast(): Promise<string> {
        return new Promise(function (resolve) {
            cp.exec('uname -sr', {shell: true}, function (err, out) {
                if (err && !out) {
                    return resolve('Unknown');
                }
                return resolve(out)
            })
        })
    }

    private static getOsWin(): Promise<string> {
        return new Promise(function (resolve) {
            cp.exec('wmic os get Caption /value', {shell: true}, function (err, out) {
                if (err && !out) {
                    return MachineState.getOsLast();
                }
                resolve(out.match(/[\n\r].*Caption=\s*([^\n\r]*)/)[1]);
            })
        })
    }

    private static getOsDarwin(): Promise<string> {
        return new Promise(function (resolve) {
            cp.exec('sw_vers', {shell: true}, function (err, out) {
                if (err && !out) {
                    return MachineState.getOsLast();
                }
                const version = out.match(/[\n\r].*ProductVersion:\s*([^\n\r]*)/)[1];
                const distribution = out.match(/.*ProductName:\s*([^\n\r]*)/)[1];
                return resolve(distribution + ' ' + version);
            })
        })
    }

    private static getOsLinux(): Promise<string> {
        return new Promise<string>((resolve) => {
            fs.readFile('/etc/issue', function (err, out: any) {
                if (err) {
                    return MachineState.getOsLast();
                }
                out = out.toString();
                let version = out.match(/[\d]+(\.[\d][\d]?)?/);

                if (version !== null) {
                    version = version[0]
                }
                const distribution = out.match(/[\w]*/)[0];
                if (version !== null && distribution !== null) {
                    let resultOs = distribution + ' ' + version;
                    return resolve(resultOs)
                } else if (distribution !== null && distribution !== '') {
                    return resolve(distribution)
                } else if (version === null) {
                    fs.readFile('/etc/redhat-release', (err, out: any) => {
                        if (err) {
                            return MachineState.getOsLast();
                        }
                        out = out.toString();
                        version = out.match(/[\d]+(\.[\d][\d]?)?/);

                        if (version !== null) {
                            version = version[0]
                        }
                        return resolve('Red Hat ' + version);
                    })
                }
            })
        })
    }

    private static async getPidUsage(): Promise<any>
    {
        return new Promise<object>((resolve, reject) => {
            pidUsage(process.pid, (err, stats) => {
                if(err){reject(err);}
                resolve(stats);
            });
        });
    }

    /**
     * @return
     * The CPU usage in percentage.
     * The memory usage in MB.
     */
    static async getPidInfo(): Promise<{cpu: number,memory: number}>
    {
        const pidUsage = await MachineState.getPidUsage();
        return {
            cpu: pidUsage.cpu,
            memory: pidUsage.memory / 1e+6
        }
    }

    private static darwinMem = {
        PAGE_SIZE: 4096,
        physicalMemory: co.wrap(function * () {
            let res = yield (MachineState.exec('sysctl hw.memsize')());
            res = res.trim().split(' ')[1];
            return parseInt(res)
        }),
        vmStats: co.wrap(function * () {
            const mappings = {
                'Anonymous pages': 'app',
                'Pages wired down': 'wired',
                'Pages active': 'active',
                'Pages inactive': 'inactive',
                'Pages occupied by compressor': 'compressed'
            };

            let ret = {};
            let res = yield (MachineState.exec('vm_stat')());
            let lines = res.split('\n');

            lines = lines.filter(x => x !== '');

            lines.forEach(x => {
                const parts = x.split(':');
                const key = parts[0];
                const val = parts[1].replace('.', '').trim();

                if (mappings[key]) {
                    const k = mappings[key];

                    ret[k] = val * MachineState.darwinMem.PAGE_SIZE
                }
            });
            return ret
        }),
        memory: co.wrap(function * () {
            const total = yield MachineState.darwinMem.physicalMemory();
            const stats = yield MachineState.darwinMem.vmStats();
            const used = (stats.wired + stats.active + stats.inactive);
            return { used: used, total: total }
        })
    };
}