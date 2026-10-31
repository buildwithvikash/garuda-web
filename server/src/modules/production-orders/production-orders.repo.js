// Production orders (PRODHeader + PRODMaterial): the lookups the order screen uses. SQL text is the original
// ProductionOrderForm's (WRL branches); codes are checked digits (shared/utils/sql.js) before they go into it.
// Saving goes through the forms writer (services/forms/write.service.js) as the original's DataWrapper did.
import { query, scalar } from '../../db/pool.js';
import { fill } from '../../db/options.js';
import { netString, netLong, netBool } from '../../shared/net.js';
import { digitsOrEmpty } from '../../shared/sql.js';

/** whether the production order exists in the business unit (another unit's order is as good as none) */
export const exists = async (prodNo, businessUnit) =>
  (await scalar('select count(*) from PRODHeader where PRODNo=@k and BusinessUnit=@bu', { k: Number(prodNo), bu: Number(businessUnit) })) > 0;

/** the list rows of one business unit (a condition on the list's row X; lists.js listPage scope) */
export const businessUnitScope = (businessUnit) => ({ where: 'X.PRODNO in (select PRODNo from PRODHeader where BusinessUnit = @scopeBu)', params: { scopeBu: Number(businessUnit) } });

/** The serials generated for the order: each job card's stage label (Production Assignment's print), oldest first, with
 *  when it was printed (the job card's barcode: MaterialBarcode.CreatedOn, date and time; ProcessOrder.AssignDate is the
 *  date only). */
export const serials = (prodNo) =>
  query(
    `select psl.BarcodeNo [serial], po.Alias [jobCard], pp.Name [process], wc.Name [station], m.Name [material], mb.CreatedOn [printedOn]
       from ProcessOrder po
       inner join ProcessStageLabel psl on psl.PSNo = po.PSNo
       left join ProductionProcess pp on pp.ProcessCode = psl.ProcessCode
       left join WorkCenter wc on wc.StationCode = psl.StationCode
       left join Material m on m.MatCode = po.Material
       outer apply (select top 1 b.CreatedOn from MaterialBarcode b where b.DocNo = po.PSNo and b.DocType = 4001 order by b.BarcodeNo) mb
      where po.PRODNo = @k
      order by po.PSNo, psl.SeqNo`,
    { k: Number(prodNo) },
  );

const parseString = (v) => (netString(v) === '&nbsp;' ? '' : netString(v));

/** finished goods and semi-finished: the default material list (order types other than 4) */
export const productionMaterials = () => fill("Select MatCode, Name From Material where status =1 and (Type>=100 and Type<200) or (Type>=400 and Type<500) order by Name");
/** order type 4 (service request): service materials */
export const serviceMaterials = () => fill("Select MatCode, Name From Material where status =1 and Type=300  order by Name");
/** every active material (a sales order cleared) */
export const activeMaterials = () => fill("Select MatCode, Name from Material Where Status=1");

/** open sales orders of the business unit */
export const salesOrders = (bu) => fill(`Select so.SONo,CONCAT(so.alias,' - ',l.Name,'-',so.Remark)[Name] from SOHeader so left Join Ledger l on so.Customer =l.LedgerCode where so.BusinessUnit =${digitsOrEmpty(bu)}  and so.Status=1`);
/** open service requests of the business unit holding the material */
export const serviceRequests = (bu, material) => fill(`Select so.SONo,CONCAT(so.alias,'-',so.QuoteRef,' - ',l.Name)[Name] from SRHeader so inner join SRMaterial sr on so.SONO=sr.SONo and sr.Material=${netLong(material)} left Join Ledger l on so.Customer =l.LedgerCode where so.BusinessUnit =${digitsOrEmpty(bu)}  and so.Status=1`);
/** the materials of a sales order */
export const salesOrderMaterials = (soNo) => fill(`select s.Material, m.Name as Name from SOMaterial s left join Material m on s.Material =m.MatCode where s.SONO=${digitsOrEmpty(soNo)}`);

/** the material's base unit and whether it is serial-tracked */
export async function materialBasics(matCode) {
  const m = digitsOrEmpty(matCode);
  return {
    baseUom: parseString(await scalar(`select BaseUom from Material where MatCode = ${m}`)),
    serial: netBool(await scalar(`select  Serial from Material where MatCode=${m}`)),
  };
}
/** the material's BOMs */
export const boms = (matCode) => fill(`Select BOMCode, Alias from BOMHeader where material=${digitsOrEmpty(matCode)}`);

/** the business unit's GS1 prefix (start of a track ID) */
export const gs1Prefix = async (bu) => parseString(await scalar(`select GS1Prefix from BusinessUnit where BUCode=${digitsOrEmpty(bu)}`));
/** the HMI code of a service request's material row (its track ID); undefined / null when there is none */
export const serviceRequestTrackId = (soNo) => scalar(`Select HMICode from SRMaterial where SONO=${digitsOrEmpty(soNo)}`);
