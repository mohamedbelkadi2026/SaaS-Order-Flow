export type TeamPeriod = 'today' | 'day' | 'month' | 'last_month' | 'custom';
export function isCalendarDate(value:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}
export function validTeamRange(from:string,to:string):boolean {
 return isCalendarDate(from) && isCalendarDate(to) && from<=to;
}
export function teamPeriodRange(period:TeamPeriod,today:string,day:string,custom:{from:string;to:string}):{from:string;to:string} {
 if(period==='custom')return custom;
 if(period==='day')return {from:day,to:day};
 if(period==='month')return {from:today.slice(0,7)+'-01',to:today};
 if(period==='last_month'){
  const [year,month]=today.split('-').map(Number);
  const last=new Date(Date.UTC(year,month-1,0,12)).toISOString().slice(0,10);
  return {from:last.slice(0,7)+'-01',to:last};
 }
 return {from:today,to:today};
}
