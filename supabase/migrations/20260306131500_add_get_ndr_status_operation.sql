begin;

alter table public.delhivery_operation_logs
  drop constraint if exists delhivery_operation_logs_operation_check;

alter table public.delhivery_operation_logs
  add constraint delhivery_operation_logs_operation_check
  check (
    operation in (
      'check_pincode_serviceability',
      'calculate_shipping_cost',
      'create_client_warehouse',
      'update_client_warehouse',
      'create_shipment',
      'update_shipment',
      'cancel_shipment',
      'fetch_waybill',
      'generate_label',
      'schedule_pickup',
      'cancel_pickup',
      'track_shipment',
      'ndr_action',
      'get_ndr_status'
    )
  );

commit;
