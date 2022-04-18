/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import * as os from 'os';

function getFirstMacAddress() {
    const networkInterfaces = os.networkInterfaces();
    if(networkInterfaces == null) return "";
    for(const interfaceKey in networkInterfaces){
        const networkInterface = networkInterfaces[interfaceKey];
        if(!networkInterface) continue;
        const length = networkInterface.length;
        for(let i = 0; i < length; i++){
            if(networkInterface[i] !== undefined && networkInterface[i].mac && networkInterface[i].mac != '00:00:00:00:00:00'){
                return networkInterface[i].mac;
            }
        }
    }
}

const macAddress = getFirstMacAddress();
export let machineId = macAddress ? parseInt(macAddress.replace(/\:|\D+/gi, '')).toString(36) : '';