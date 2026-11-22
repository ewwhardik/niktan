-- Demo hospitals and staff. Staff PINs (demo only) are listed in the README.
-- pin_hash = sha256("niktan:<hospital_id>:<pin>")
INSERT INTO hospitals (id, name_hi, name_en, district, is_demo) VALUES
  ('demo-dh', 'जिला अस्पताल (डेमो)', 'District Hospital (Demo)', 'Raipur', 1),
  ('demo-chc', 'सामुदायिक स्वास्थ्य केंद्र (डेमो)', 'Community Health Centre (Demo)', 'Raipur', 1);

INSERT INTO departments (id, hospital_id, code, avg_consult_min) VALUES
  ('demo-dh:medicine', 'demo-dh', 'medicine', 6),
  ('demo-dh:paediatrics', 'demo-dh', 'paediatrics', 7),
  ('demo-dh:gynaecology', 'demo-dh', 'gynaecology', 8),
  ('demo-dh:ophthalmology', 'demo-dh', 'ophthalmology', 5),
  ('demo-dh:ent', 'demo-dh', 'ent', 5),
  ('demo-dh:orthopaedics', 'demo-dh', 'orthopaedics', 6),
  ('demo-dh:dermatology', 'demo-dh', 'dermatology', 4),
  ('demo-dh:surgery', 'demo-dh', 'surgery', 7),
  ('demo-dh:dental', 'demo-dh', 'dental', 8),
  ('demo-dh:emergency', 'demo-dh', 'emergency', 10),
  ('demo-chc:medicine', 'demo-chc', 'medicine', 6),
  ('demo-chc:paediatrics', 'demo-chc', 'paediatrics', 7),
  ('demo-chc:gynaecology', 'demo-chc', 'gynaecology', 8),
  ('demo-chc:ophthalmology', 'demo-chc', 'ophthalmology', 5),
  ('demo-chc:ent', 'demo-chc', 'ent', 5),
  ('demo-chc:orthopaedics', 'demo-chc', 'orthopaedics', 6),
  ('demo-chc:dermatology', 'demo-chc', 'dermatology', 4),
  ('demo-chc:surgery', 'demo-chc', 'surgery', 7),
  ('demo-chc:dental', 'demo-chc', 'dental', 8),
  ('demo-chc:emergency', 'demo-chc', 'emergency', 10);

INSERT INTO staff (id, hospital_id, role, pin_hash) VALUES
  ('demo-dh-nurse', 'demo-dh', 'nurse', '8dcda03b29127515b7487b60b1d8728d17913ed325f192bc7716818c08a1c170'),
  ('demo-dh-doctor', 'demo-dh', 'doctor', '5bee3c56f2776bf27a8209d607240c76185fe110d414a0f315b886afbfbd6585'),
  ('demo-dh-admin', 'demo-dh', 'admin', '233c21e95190bda792f0725bf7bc205792b89da448beb3cc952c8248432b0261'),
  ('demo-chc-nurse', 'demo-chc', 'nurse', '24f34bc318f6b2f1ea27c5d4e34832b1e999ae8db446cf8dfd67bd6b30ad56e4'),
  ('demo-chc-doctor', 'demo-chc', 'doctor', '254d956162f33261b6e190a292a0c01434993919f309200dc1eb84e64e7d599a'),
  ('demo-chc-admin', 'demo-chc', 'admin', '489eeca91c0d1b93ba0929dc49fb4805216c36c893a55baf23127b69af4b3102');
