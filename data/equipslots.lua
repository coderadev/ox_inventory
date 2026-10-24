-- Which items each Body / Accessories slot accepts.
--
-- The key is the slot number (see CONFIG.layout in web/build/js/app.js):
--   Body:        36 ID card · 37 phone · 38 keys · 39 wallet · 40 backpack
--   Accessories: 41 headset · 42 mask · 43 glasses · 44 armour · 45 clothes
--
-- Each list holds exact item names. A trailing * matches any name starting with that
-- text, e.g. 'mask*' accepts mask, mask_red, mask_skull ...
-- A slot that is missing here (or has an empty list) accepts any item.
-- Set `enabled = false` to turn the whole restriction off.
return {
	enabled = true,

	slots = {
		[36] = { 'identification', 'id_card', 'idcard', 'driver_license', 'license*' },
		[37] = { 'phone', 'phone*' },
		[38] = { 'key*', 'carkey', 'car_keys', 'vehiclekey', 'vehicle_key' },
		[39] = { 'wallet', 'mastercard', 'money', 'black_money' },
		[40] = { 'backpack*', 'bag', 'duffelbag', 'duffel_bag', 'sportbag' },

		[41] = { 'headset', 'headphones', 'earphones', 'earpiece' },
		[42] = { 'mask*' },
		[43] = { 'glasses*', 'sunglasses*' },
		[44] = { 'armour', 'armor', 'armour*', 'armor*', 'vest*' },
		[45] = { 'clothing', 'clothes*', 'tshirt', 'jacket', 'pants', 'shoes', 'hat', 'panties' },
	},
}
