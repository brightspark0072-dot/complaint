-- Synthetic reference data only. No real people, organizations or complaints.
insert into public.organizations (name, type) values
  ('Sample City Municipal Office', 'public_service'),
  ('Sample College', 'education'),
  ('Sample Retail Co.', 'consumer'),
  ('Sample Employer Ltd.', 'workplace')
on conflict do nothing;

with parents as (
  insert into public.complaint_categories (name, org_type) values
    ('Public services', 'public_service'),
    ('Consumer issues', 'consumer'),
    ('Education', 'education'),
    ('Workplace', 'workplace'),
    ('Other', 'other')
  on conflict do nothing
  returning id, name
)
insert into public.complaint_categories (parent_id, name)
select p.id, s.name from parents p
join (values
  ('Public services','Roads & drainage'), ('Public services','Water supply'),
  ('Public services','Waste management'), ('Public services','Street lighting'),
  ('Consumer issues','Product or service'), ('Consumer issues','Payment or refund'),
  ('Consumer issues','Delivery'),
  ('Education','Facilities & infrastructure'), ('Education','Administration'),
  ('Education','Examinations'), ('Education','Hostel'),
  ('Workplace','Pay & contracts'), ('Workplace','Conduct'), ('Workplace','Safety'),
  ('Other','General complaint')
) as s(parent, name) on s.parent = p.name
on conflict do nothing;
