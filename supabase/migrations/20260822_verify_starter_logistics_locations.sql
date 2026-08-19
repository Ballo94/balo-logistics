-- The original starter locations predate the verified column. Mark only those
-- exact curated seed records as verified; administrator-created rows that do
-- not match the seed keys remain untouched.
with starter(country_code, location_type, code, name) as (values
  ('NA','airport','WDH','Hosea Kutako International Airport'),
  ('NA','seaport','NAWVB','Port of Walvis Bay'),
  ('NA','border_post',null,'Ariamsvlei Border Post'),
  ('NA','border_post',null,'Oshikango Border Post'),
  ('ZA','airport','JNB','OR Tambo International Airport'),
  ('ZA','airport','CPT','Cape Town International Airport'),
  ('ZA','seaport','ZADUR','Port of Durban'),
  ('ZA','seaport','ZACPT','Port of Cape Town'),
  ('ZA','border_post',null,'Nakop Border Post'),
  ('AO','airport','LAD','Quatro de Fevereiro International Airport'),
  ('AO','seaport','AOLAD','Port of Luanda'),
  ('AO','border_post',null,'Santa Clara Border Post'),
  ('ZM','airport','LUN','Kenneth Kaunda International Airport'),
  ('ZM','border_post',null,'Chirundu Border Post'),
  ('ZM','border_post',null,'Kazungula Border Post'),
  ('BW','airport','GBE','Sir Seretse Khama International Airport'),
  ('BW','border_post',null,'Kazungula Border Post'),
  ('ZW','airport','HRE','Robert Gabriel Mugabe International Airport'),
  ('ZW','border_post',null,'Beitbridge Border Post'),
  ('MZ','airport','MPM','Maputo International Airport'),
  ('MZ','seaport','MZMPM','Port of Maputo'),
  ('MZ','seaport','MZBEW','Port of Beira'),
  ('NG','airport','LOS','Murtala Muhammed International Airport'),
  ('NG','seaport','NGAPP','Apapa Port'),
  ('NG','seaport',null,'Tin Can Island Port'),
  ('GH','airport','ACC','Kotoka International Airport'),
  ('GH','seaport','GHTEM','Port of Tema'),
  ('GH','seaport','GHTKD','Port of Takoradi'),
  ('KE','airport','NBO','Jomo Kenyatta International Airport'),
  ('KE','seaport','KEMBA','Port of Mombasa'),
  ('KE','border_post',null,'Namanga Border Post'),
  ('UG','airport','EBB','Entebbe International Airport'),
  ('UG','border_post',null,'Malaba Border Post'),
  ('TZ','airport','DAR','Julius Nyerere International Airport'),
  ('TZ','seaport','TZDAR','Port of Dar es Salaam'),
  ('TZ','border_post',null,'Tunduma Border Post'),
  ('CD','airport','FIH','N''djili International Airport'),
  ('CD','seaport','CDMAT','Port of Matadi'),
  ('CD','border_post',null,'Kasumbalesa Border Post'),
  ('AE','airport','DXB','Dubai International Airport'),
  ('AE','airport','AUH','Zayed International Airport'),
  ('AE','seaport','AEJEA','Jebel Ali Port'),
  ('CN','airport','CAN','Guangzhou Baiyun International Airport'),
  ('CN','airport','SZX','Shenzhen Bao''an International Airport'),
  ('CN','seaport','CNSHA','Port of Shanghai'),
  ('CN','seaport','CNSZX','Port of Shenzhen'),
  ('CN','seaport','CNNGB','Port of Ningbo-Zhoushan')
)
update public.logistics_locations location
set verified = true,
    updated_at = now()
from starter
where location.country_code = starter.country_code
  and location.location_type = starter.location_type
  and lower(location.name) = lower(starter.name)
  and (starter.code is null or lower(location.code) = lower(starter.code))
  and location.verified = false;
