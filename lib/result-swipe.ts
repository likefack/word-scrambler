export type SwipeStart={x:number;y:number;time:number};
/** Gesture classification only; never captures/prevents ordinary vertical scrolling. */
export function resultSwipe(start:SwipeStart|null,end:{x:number;y:number;time:number},hasSelection:boolean):'before'|'after'|null{
  if(!start||hasSelection)return null;
  const dx=end.x-start.x,dy=end.y-start.y,duration=end.time-start.time;
  if(duration<30||duration>650||Math.abs(dx)<64||Math.abs(dy)>45||Math.abs(dx)<Math.abs(dy)*1.6)return null;
  return dx>0?'before':'after';
}
export function isVerticalGesture(start:SwipeStart,x:number,y:number):boolean{
  return Math.abs(y-start.y)>24&&Math.abs(y-start.y)>=Math.abs(x-start.x);
}
