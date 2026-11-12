-- Add admin write policies to category_hsn_codes (currently only has a public SELECT policy)

CREATE POLICY "category_hsn_codes_admin_insert"
  ON public.category_hsn_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "category_hsn_codes_admin_update"
  ON public.category_hsn_codes
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "category_hsn_codes_admin_delete"
  ON public.category_hsn_codes
  FOR DELETE
  TO authenticated
  USING (is_admin());
