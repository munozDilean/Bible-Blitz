// Shared pure helpers so delayed/out-of-order response handling has regression tests.
export type Snapshot={revision:number;serverTime:number};
export function isNewer(next:Snapshot,current:Snapshot|null){
  return !current||next.revision>current.revision||
    (next.revision===current.revision&&next.serverTime>=current.serverTime);
}
export function clockSample(sent:number,received:number,serverReceived:number,serverSent:number){
  const networkMs=Math.max(0,received-sent-(serverSent-serverReceived));
  return {networkMs,offset:((serverReceived-sent)+(serverSent-received))/2};
}
export function pollDelay(phase:string,answered=false){
  if(phase==='finished')return 5000;
  if(phase==='lobby'||phase==='reveal')return 2000;
  return answered?1500:1000;
}

