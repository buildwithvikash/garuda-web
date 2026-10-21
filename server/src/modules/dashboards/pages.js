// One entry per original page in View/Dashboards/WRL: what its Page_Load computed, in display order.
// next = the page its "Refresh: 60; URL=..." header rotated to (null = no auto refresh).
// Panel kinds: foam / cabinet dials, monthly strip, hourly, quality, station (emergency) status, brazing, static.

const foam = (station, title, unit, activity, remark = null) => ({ kind: 'foamDial', station, title, unit, activity, remark });
const cab = (station, title, unit, remark = null) => ({ kind: 'cabinetDial', station, title, unit, remark });
const monthly = (process, variant = 'default') => ({ kind: 'monthly', process, variant });

const brazingSql = (processes) =>
  `with Brazingdump as(select distinct  pt.Name[JointNo], ri.SeqNo, ih.DocNo, pt.LineCode, pr.RouteCode, iud.Status[status], pr.ProcessCode, pp.Name, wp.StationCode, pl.UserCode, it.InspectionLotNo, it.ID  from InspectionTrans it inner join InspectionHeader ih on it.InspectionLotNo = ih.InspectionLotNo  and it.InspectedOn between @loginT and @shiftEnd  inner join ProcessRouting pr on pr.PSNo = ih.DocNo  and pr.ProcessCode = ih.Process  and pr.ProcessCode IN(${processes})  left join InspectionUD iud on it.ID = iud.ID  left join ParameterTran pt on pt.ParameterCode = pr.ParameterCode and pr.ProcessCode IN(${processes}) AND pt.LineCode = iud.LineCode  inner join RouteInstruction ri on pr.RouteCode = ri.RouteCode and pt.Name = ri.Instruction  inner join RoutingTrans rt on rt.SeqNo = ri.SeqNo and ri.RouteCode = pr.RouteCode  inner join ProductionProcess pp on pp.ProcessCode = rt.ProcessCode and pp.ProcessCode =@bProcess inner join WorkCenterProcesses wp on wp.ProcessCode = rt.ProcessCode and rt.ProcessCode =@bProcess inner join ProcessUserLogin pl on wp.StationCode = pl.Station and pl.Status = 1 and pl.UserCode = @operatorCode),  DEFECTCOUNT as (select SUM(DefectCount)AS DefectCount FROM(SELECT count(distinct[JointNo]) AS DefectCount from Brazingdump where status = 0  group by DocNo)A) ,  TOTALDOC AS(select count(distinct([JointNo])) [TotalJoint] from Brazingdump group by  [DocNo] )  SELECT ISNULL(SUM(TOTALDOC.TotalJoint),0) as TotalJoint ,isnull(DEFECTCOUNT.DefectCount, 0) as DefectCount,(ISNULL(SUM(TOTALDOC.TotalJoint), 0) - isnull(DEFECTCOUNT.DefectCount, 0)) AS OKCOUNT FROM TOTALDOC, DEFECTCOUNT GROUP BY DEFECTCOUNT.DefectCount`;
const brazing = (stations, processes) => ({ kind: 'brazing', stations, sql: brazingSql(processes) });

export const WRL_DASHBOARDS = {
  foamdashboard: {
    moduleId: 9001, title: 'FOAMING AREA PRODUCTION PERFORMANCE', dept: 1220001, next: 'foamingdashboard1',
    panels: [foam('1220001', 'Cabinet Preassembly - A', 'Cabinets/Shift', '1'), foam('1220002', 'Cabinet Preassembly - B', 'Cabinets/Shift', '1'),
      foam('1220001', 'Cabinet Foaming - A', 'Cabinets/Shift', '5'), foam('1220002', 'Cabinet Foaming - B', 'Cabinets/Shift', '5'), monthly('12202')],
  },
  foamingdashboard1: {
    moduleId: 9002, title: 'FOAMING AREA PRODUCTION PERFORMANCE', dept: 1220001, next: 'hourlpreassemblyadashboard',
    panels: [foam('1220001', 'Cabinet Preassembly - A', 'Cabinets/Shift', '1'), foam('1220002', 'Cabinet Preassembly - B', 'Cabinets/Shift', '1'), monthly('12202')],
  },
  foamingdashboard2: {
    moduleId: 9003, title: 'FOAMING AREA PRODUCTION PERFORMANCE', dept: 1220001, next: 'hourlyfoamingperformancedashboard',
    panels: [foam('1220001', 'Cabinet Foaming - A', 'Cabinets/Shift', '5'), foam('1220002', 'Cabinet Foaming - B', 'Cabinets/Shift', '5'), monthly('12202')],
  },
  cabinetpackingdashboard: {
    moduleId: 9004, title: 'FINAL AREA PRODUCTION PERFORMANCE', dept: 1220001, next: null,
    panels: [foam('1230007', 'Fow Post-Foaming', 'Cabinets/Shift', '1'), foam('1230009', 'Lid Foaming', 'Lids/Shift', '1'),
      cab('1220005', 'Compoent Scanning', 'Loading/Shift'), cab('1220009', 'Cabinet Packing', 'FG/Shift'), monthly('12212')],
  },
  cabinetpackingdashboard1: {
    moduleId: 9005, title: 'LID AND FOW FOAMING PERFORMANCE', dept: 1220001, next: null,
    panels: [foam('1230007', 'Fow Post-Foaming', 'Cabinets/Shift', '1'), foam('1230009', 'Lid Foaming', 'Lids/Shift', '1'), monthly('12202')],
  },
  cabinetpackingdashboard2: {
    moduleId: 9006, title: 'FINAL AREA PRODUCTION PERFORMANCE', dept: 1220001, next: 'hourlyproductionperformancedashboard',
    panels: [cab('1220005', 'Compoent Scanning', 'Loading/Shift'), cab('1220010', 'Cabinet Packing', 'FG/Shift'), monthly('12212')],
  },
  cabinetpackingdashboard3: {
    moduleId: 9021, title: 'FINAL AREA PRODUCTION PERFORMANCE', dept: 1220001, next: 'hourlassemblyloadingdashboard',
    panels: [cab('1230005', 'Cabinet Loading', 'Loading/Shift'), cab('1220009', 'Cabinet Packing', 'FG/Shift'), monthly('12212')],
  },
  brazingdashboard: {
    moduleId: 9007, title: 'Brazing', dept: 1220001, next: 'brazingdashboard', durationSep: ' TO ',
    panels: [brazing(['1230003', '1220007', '1220006'], '12206, 12402, 12401')],
  },
  actualperformancecabintdashboard: {
    moduleId: 9008, title: 'FOAMING AREA PRODUCTION PERFORMANCE', dept: 1220001, next: null, panels: [{ kind: 'static' }],
  },
  cabinetperformancedefectdashboard: {
    moduleId: 9009, title: 'FOAMING AREA PRODUCTION PERFORMANCE', dept: 1220001, next: null, panels: [{ kind: 'static' }],
  },
  hourlyproductionperformancedashboard: {
    moduleId: 9010, title: 'HOURLY FG PERFORMANCE', dept: 1220001, next: 'productionqualityperformancedashboard',
    panels: [{ kind: 'hourly', hourly: 'production', selection: 1 }],
  },
  hourlassemblyloadingdashboard: {
    moduleId: 9011, title: 'HOURLY ASSEMBLY LOADING PERFORMANCE', dept: 1220001, next: null,
    panels: [{ kind: 'hourly', hourly: 'loading', selection: 5 }],
  },
  hourlpreassemblyadashboard: {
    moduleId: 9012, title: 'HOURLY PREASSEMBLY-A PERFORMANCE', dept: 1220001, next: 'hourlpreassemblybdashboard',
    panels: [{ kind: 'hourly', hourly: 'preAssemblyA', selection: 6 }],
  },
  hourlpreassemblybdashboard: {
    moduleId: 9013, title: 'HOURLY PREASSEMBLY-B PERFORMANCE', dept: 1220001, next: 'wrlstationstatusdashboard4',
    panels: [{ kind: 'hourly', hourly: 'preAssemblyB', selection: 7 }],
  },
  hourlyfoamingperformancedashboard: {
    moduleId: 9014, title: 'HOURLY FOAMING PERFORMANCE', dept: 1220001, next: 'foamingqualityperformancedashboard',
    panels: [{ kind: 'hourly', hourly: 'production', selection: 2 }],
  },
  foamingqualityperformancedashboard: {
    moduleId: 9015, title: 'FOAMING QUALITY PERFORMANCE', dept: 1220001, next: 'wrlstationstatusdashboard3',
    panels: [{ kind: 'quality', processes: '12202,12304', selection: 4, captions: ['Foaming Plan', 'Cabinet Qty', 'OK Cabinet', 'Defect Cabinet', 'OK Cabinet %', 'Defect Cabinet %'] }],
  },
  productionqualityperformancedashboard: {
    moduleId: 9016, title: 'FG QUALITY PERFORMANCE', dept: 1220001, next: 'wrlstationstatusdashboard2',
    panels: [{ kind: 'quality', processes: '12212,12213,12303', selection: 3, captions: ['Packing Plan', 'FG Unit Made', 'OK Unit', 'Defect Unit', 'OK Unit %', 'Defect Unit %'] }],
  },
  wrlstationstatusdashboard1: { moduleId: 9017, title: 'BUFFER STRORAGE', dept: 1220001, next: 'cabinetpackingdashboard3', panels: [{ kind: 'station', location: 'BUFFER STRORAGE' }] },
  wrlstationstatusdashboard2: { moduleId: 9018, title: 'FINAL ASSEMBLY', dept: 1220001, next: 'cabinetpackingdashboard2', panels: [{ kind: 'station', location: 'FINAL ASSEMBLY' }] },
  wrlstationstatusdashboard3: { moduleId: 9019, title: 'POST-FOAMING', dept: 1220001, next: 'foamingdashboard2', panels: [{ kind: 'station', location: 'POST-FOAMING' }] },
  wrlstationstatusdashboard4: { moduleId: 9020, title: 'PRE-FOAMING ASSEMBLY', dept: 1220001, next: 'foamingdashboard1', panels: [{ kind: 'station', location: 'PRE-FOAMING ASSEMBLY' }] },
  swcpreassemblydashboard1: {
    moduleId: 9024, title: 'FOAMING AREA PRODUCTION PERFORMANCE', dept: 1230005, next: 'swcpreassemblydashboard1',
    panels: [foam('1260004', 'SWC PRE - ASSEMBLY', 'Cabinets/Shift', '1'), monthly('12202')],
  },
  suspreassemblydashboard: {
    moduleId: 9025, title: 'SUS PRE ASSEMBLY PRODUCTION PERFORMANCE', dept: 1230005, next: 'suspreassemblydashboard',
    panels: [foam('1260005', 'SUS PRE - ASSEMBLY', 'Cabinets/Shift', '1'), foam('1260004', 'SWC PRE - ASSEMBLY', 'Cabinets/Shift', '1'), monthly('12202')],
  },
  suspostassemblydashboard: {
    moduleId: 9026, title: 'SUS POST FOAMING PRODUCTION PERFORMANCE', dept: 1230006, next: 'suspostassemblydashboard',
    panels: [foam('1230012', 'SUS POST FOAMING LABEL', 'Cabinets/Shift', '5', '12304'), foam('1260013', 'SWC POST FOAMING LABEL', 'Cabinets/Shift', '5', '12304'), monthly('12202')],
  },
  susloadingdashboard: {
    moduleId: 9027, title: 'FINAL AREA PRODUCTION PERFORMANCE', dept: 1230009, next: null,
    panels: [cab('1230013', 'SUS LOADING', 'Loading/Shift'), cab('1230017', 'FG Packing', 'FG/Shift'), monthly('12212')],
  },
  susbrazingdashboard: {
    moduleId: 9028, title: 'Brazing', dept: 1220001, next: 'susbrazingdashboard', durationSep: ' TO ',
    panels: [brazing(['1260002', '1260001'], '12611, 12610, 12603')],
  },
  susunloadingdashboard: {
    moduleId: 9029, title: 'FINAL AREA PRODUCTION PERFORMANCE', dept: 1230001, next: 'susunloadingdashboard',
    panels: [cab('1230018', 'SUS FG PACKING', 'Loading/Shift'), cab('1230014', 'SUS LOADING', 'FG/Shift'), monthly('12313')],
  },
  visipostassemblydashboard: {
    moduleId: 9030, title: 'VISI POST FOAMING PRODUCTION PERFORMANCE', dept: 1230006, next: 'visipostassemblydashboard',
    panels: [foam('1240003', 'SUS POST FOAMING LABEL', 'Cabinets/Shift', '5', '12605'), monthly('12202', 'VISI')],
  },
  visiloadingdashboard: {
    moduleId: 9031, title: 'FINAL AREA PRODUCTION PERFORMANCE', dept: 1230009, next: null,
    panels: [cab('1220005', 'VISI LOADING', 'Loading/Shift', '12605'), cab('1220010', 'FG Packing', 'FG/Shift', '12605'), monthly('12212', 'VISI')],
  },
  visibrazingdashboard: {
    moduleId: 9032, title: 'Brazing', dept: 1220001, next: 'visibrazingdashboard', durationSep: ' TO ',
    panels: [brazing(['1260016', '1260015', '1260014'], '12612, 12613, 12617')],
  },
  visiunloadingdashboard: {
    moduleId: 9033, title: 'FINAL AREA PRODUCTION PERFORMANCE', dept: 1230001, next: 'visiunloadingdashboard',
    panels: [cab('1220010', 'VISI FG PACKING', 'Loading/Shift', '12605'), cab('1220005', 'VISI LOADING', 'FG/Shift', '12605'), monthly('12313', 'VISI')],
  },
  // Not in the menu in the original (reachable only by URL); kept, restricted to system users.
  visipreassemblydashboard: {
    moduleId: null, title: 'SUS PRE ASSEMBLY PRODUCTION PERFORMANCE', dept: 1230005, next: 'visipreassemblydashboard',
    panels: [foam('1260005', 'SUS PRE - ASSEMBLY', 'Cabinets/Shift', '1'), foam('1260004', 'SWC PRE - ASSEMBLY', 'Cabinets/Shift', '1'), monthly('12202')],
  },
};
