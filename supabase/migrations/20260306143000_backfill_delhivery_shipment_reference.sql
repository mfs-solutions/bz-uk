begin;

create index if not exists idx_delhivery_shipments_seller_shipment_reference
  on public.delhivery_shipments (seller_id, shipment_reference)
  where shipment_reference is not null and btrim(shipment_reference) <> '';

-- Backfill from shipment raw payload where reference-like fields are present.
with payload_refs as (
  select
    ds.id,
    coalesce(
      nullif(btrim(ds.raw_payload ->> 'shipment_reference'), ''),
      nullif(btrim(ds.raw_payload ->> 'reference'), ''),
      nullif(btrim(ds.raw_payload ->> 'order'), ''),
      nullif(btrim(ds.raw_payload ->> 'order_id'), ''),
      nullif(btrim(ds.raw_payload ->> 'ref_id'), ''),
      nullif(btrim(ds.raw_payload ->> 'ref_ids'), ''),
      nullif(btrim(ds.raw_payload #>> '{data,shipment_reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{data,reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{data,order}'), ''),
      nullif(btrim(ds.raw_payload #>> '{data,order_id}'), ''),
      nullif(btrim(ds.raw_payload #>> '{shipment,shipment_reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{shipment,reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{shipment,order}'), ''),
      nullif(btrim(ds.raw_payload #>> '{shipments,0,shipment_reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{shipments,0,reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{shipments,0,order}'), ''),
      nullif(btrim(ds.raw_payload #>> '{packages,0,shipment_reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{packages,0,reference}'), ''),
      nullif(btrim(ds.raw_payload #>> '{packages,0,order}'), '')
    ) as shipment_reference_candidate
  from public.delhivery_shipments ds
)
update public.delhivery_shipments ds
set shipment_reference = payload_refs.shipment_reference_candidate
from payload_refs
where ds.id = payload_refs.id
  and (ds.shipment_reference is null or btrim(ds.shipment_reference) = '')
  and payload_refs.shipment_reference_candidate is not null;

-- Backfill from create_shipment operation logs for rows still missing shipment_reference.
with ranked_create_logs as (
  select
    ol.id,
    ol.seller_id,
    ol.provider_reference,
    ol.created_at,
    coalesce(
      nullif(btrim(ol.request_payload #>> '{requestData,order}'), ''),
      nullif(btrim(ol.request_payload #>> '{requestData,reference}'), ''),
      nullif(btrim(ol.request_payload #>> '{requestData,ref_id}'), ''),
      nullif(btrim(ol.request_payload #>> '{requestData,ref_ids}'), ''),
      nullif(btrim(ol.request_payload #>> '{requestData,shipments,0,order}'), ''),
      nullif(btrim(ol.request_payload #>> '{requestData,shipments,0,reference}'), ''),
      nullif(btrim(ol.request_payload #>> '{requestData,shipments,0,ref_id}'), ''),
      nullif(btrim(ol.request_payload #>> '{requestData,shipments,0,ref_ids}'), '')
    ) as shipment_reference_candidate,
    row_number() over (
      partition by ol.seller_id, ol.provider_reference
      order by ol.created_at desc
    ) as rn
  from public.delhivery_operation_logs ol
  where ol.operation = 'create_shipment'
    and ol.provider_reference is not null
),
latest_create_logs as (
  select
    seller_id,
    provider_reference,
    shipment_reference_candidate
  from ranked_create_logs
  where rn = 1
    and shipment_reference_candidate is not null
)
update public.delhivery_shipments ds
set shipment_reference = lcl.shipment_reference_candidate
from latest_create_logs lcl
where (ds.shipment_reference is null or btrim(ds.shipment_reference) = '')
  and ds.seller_id = lcl.seller_id
  and (
    (ds.awb_number is not null and ds.awb_number = lcl.provider_reference)
    or (ds.waybill is not null and ds.waybill = lcl.provider_reference)
  );

commit;
