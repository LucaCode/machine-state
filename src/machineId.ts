import * as os from 'os';

let mac = '';
export let machineId = '';
const networkInterfaces = os.networkInterfaces();
if(networkInterfaces != null){
    loop: for(const interfaceKey in networkInterfaces){
            const networkInterface = networkInterfaces[interfaceKey];
            if(!networkInterface) continue;
            const length = networkInterface.length;
            for(let i = 0; i < length; i++){
                if(networkInterface[i] !== undefined && networkInterface[i].mac && networkInterface[i].mac != '00:00:00:00:00:00'){
                    mac = networkInterface[i].mac; break loop;
                }
            }
        }
    machineId = mac ? parseInt(mac.replace(/\:|\D+/gi, '')).toString(36) : '' ;
}