-- Enrich the curated legacy airport rows that predate coordinate support.
-- Coordinates are sourced from the repository's bundled OurAirports dataset.

do $$
declare
  ambiguous_match text;
  updated_count integer;
begin
  with airport_reference(iata_code, icao_code, country_code, latitude, longitude) as (
    values
      ('ACC', 'DGAA', 'GH',   5.605190::numeric,  -0.166786::numeric),
      ('AUH', 'OMAA', 'AE',  24.440966::numeric,  54.649237::numeric),
      ('CAN', 'ZGGG', 'CN',  23.392401::numeric, 113.299004::numeric),
      ('CPT', 'FACT', 'ZA', -33.974030::numeric,  18.604333::numeric),
      ('DAR', 'HTDA', 'TZ',  -6.873499::numeric,  39.207288::numeric),
      ('DXB', 'OMDB', 'AE',  25.249790::numeric,  55.370992::numeric),
      ('EBB', 'HUEN', 'UG',   0.042386::numeric,  32.443501::numeric),
      ('FIH', 'FZAA', 'CD',  -4.385750::numeric,  15.444600::numeric),
      ('GBE', 'FBSK', 'BW', -24.555201::numeric,  25.918200::numeric),
      ('HRE', 'FVRG', 'ZW', -17.931801::numeric,  31.092800::numeric),
      ('JNB', 'FAOR', 'ZA', -26.140081::numeric,  28.246801::numeric),
      ('LAD', 'FNLU', 'AO',  -8.858370::numeric,  13.231200::numeric),
      ('LOS', 'DNMM', 'NG',   6.577370::numeric,   3.321160::numeric),
      ('LUN', 'FLKK', 'ZM', -15.330833::numeric,  28.452722::numeric),
      ('MPM', 'FQMA', 'MZ', -25.920799::numeric,  32.572601::numeric),
      ('NBO', 'HKJK', 'KE',  -1.318886::numeric,  36.928233::numeric),
      ('SZX', 'ZGSZ', 'CN',  22.639474::numeric, 113.803262::numeric),
      ('WDH', 'FYWH', 'NA', -22.479900::numeric,  17.470900::numeric)
  ),
  ambiguous as (
    select reference.iata_code
    from airport_reference reference
    join public.logistics_locations location
      on location.location_type = 'airport'
     and upper(trim(location.country_code)) = reference.country_code
     and (
       upper(trim(coalesce(location.secondary_code, ''))) = reference.icao_code
       or upper(trim(coalesce(location.code, ''))) = reference.iata_code
     )
     and location.verified = true
     and location.admin_managed = true
     and location.source = 'manual'
     and (location.latitude is null or location.longitude is null)
    group by reference.iata_code
    having count(*) > 1
    limit 1
  )
  select iata_code into ambiguous_match from ambiguous;

  if ambiguous_match is not null then
    raise exception 'Coordinate repair aborted: ambiguous legacy airport match for %', ambiguous_match;
  end if;

  with airport_reference(iata_code, icao_code, country_code, latitude, longitude) as (
    values
      ('ACC', 'DGAA', 'GH',   5.605190::numeric,  -0.166786::numeric),
      ('AUH', 'OMAA', 'AE',  24.440966::numeric,  54.649237::numeric),
      ('CAN', 'ZGGG', 'CN',  23.392401::numeric, 113.299004::numeric),
      ('CPT', 'FACT', 'ZA', -33.974030::numeric,  18.604333::numeric),
      ('DAR', 'HTDA', 'TZ',  -6.873499::numeric,  39.207288::numeric),
      ('DXB', 'OMDB', 'AE',  25.249790::numeric,  55.370992::numeric),
      ('EBB', 'HUEN', 'UG',   0.042386::numeric,  32.443501::numeric),
      ('FIH', 'FZAA', 'CD',  -4.385750::numeric,  15.444600::numeric),
      ('GBE', 'FBSK', 'BW', -24.555201::numeric,  25.918200::numeric),
      ('HRE', 'FVRG', 'ZW', -17.931801::numeric,  31.092800::numeric),
      ('JNB', 'FAOR', 'ZA', -26.140081::numeric,  28.246801::numeric),
      ('LAD', 'FNLU', 'AO',  -8.858370::numeric,  13.231200::numeric),
      ('LOS', 'DNMM', 'NG',   6.577370::numeric,   3.321160::numeric),
      ('LUN', 'FLKK', 'ZM', -15.330833::numeric,  28.452722::numeric),
      ('MPM', 'FQMA', 'MZ', -25.920799::numeric,  32.572601::numeric),
      ('NBO', 'HKJK', 'KE',  -1.318886::numeric,  36.928233::numeric),
      ('SZX', 'ZGSZ', 'CN',  22.639474::numeric, 113.803262::numeric),
      ('WDH', 'FYWH', 'NA', -22.479900::numeric,  17.470900::numeric)
  )
  update public.logistics_locations location
  set
    latitude = coalesce(location.latitude, reference.latitude),
    longitude = coalesce(location.longitude, reference.longitude)
  from airport_reference reference
  where location.location_type = 'airport'
    and upper(trim(location.country_code)) = reference.country_code
    and (
      upper(trim(coalesce(location.secondary_code, ''))) = reference.icao_code
      or upper(trim(coalesce(location.code, ''))) = reference.iata_code
    )
    and location.verified = true
    and location.admin_managed = true
    and location.source = 'manual'
    and (location.latitude is null or location.longitude is null);

  get diagnostics updated_count = row_count;
  raise notice 'Legacy airport coordinate repair updated % record(s).', updated_count;
end;
$$;
