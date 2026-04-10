-- Create a quick procedure to populate missing lat/lng for demo purposes
UPDATE pharmacies
SET lat = -17.82 + (random() * 0.05),
    lng = 31.04 + (random() * 0.05)
WHERE lat IS NULL OR lat = 0;
