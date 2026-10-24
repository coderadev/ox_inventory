if not lib then return end

local Config = {
    coderaUI   = GetConvar('inventory:coderaui', 'true') == 'true',
    health     = GetConvar('inventory:health', 'true') == 'true',
    healthKey  = GetConvar('inventory:healthkey', 'U'),
    dropText   = 'Open Drop',
    dropTheme  = 'green',
    dropKey    = { label = 'E', control = 38 },
    displayDist  = 2.0,
    interactDist = 1.2,
    reviveEvents = {
        'hospital:client:Revive', 'hospital:client:HealInjuries',
        'esx_ambulancejob:revive', 'qbx_medical:client:playerRevived',
        'ox_inventory:codera:resetHealth',
    },
}

local function coderaUIReady()
    return Config.coderaUI and GetResourceState('codera-ui') == 'started'
end

local drawn = {}

local function textId(dropId) return ('ox_inventory:drop:%s'):format(dropId) end

local function removeDropText(dropId)
    if not drawn[dropId] then return end
    drawn[dropId] = nil
    if GetResourceState('codera-ui') == 'started' then
        exports['codera-ui']:delete3DTextUI(textId(dropId))
    end
end

local function createDropText(dropId, data)
    if not coderaUIReady() or drawn[dropId] or not data or not data.coords then return end
    drawn[dropId] = true

    if client.dropmarker then client.dropmarker.scale = { 0.0, 0.0, 0.0 } end

    exports['codera-ui']:create3DTextUI(textId(dropId), {
        coords = vector3(data.coords.x, data.coords.y, data.coords.z),
        displayDist = Config.displayDist,
        interactDist = Config.interactDist,
        enableKeyClick = true,
        keyNum = Config.dropKey.control,
        key = Config.dropKey.label,
        text = Config.dropText,
        theme = Config.dropTheme,
        triggerData = {
            isServer = false,
            triggerName = 'ox_inventory:codera:openDrop',
            args = { dropId = dropId },
        },
    })
end

RegisterNetEvent('ox_inventory:createDrop', function(dropId, data)
    if source == '' then return end
    createDropText(dropId, data)
end)

RegisterNetEvent('ox_inventory:removeDrop', function(dropId)
    if source == '' then return end
    removeDropText(dropId)
end)

AddEventHandler('ox_inventory:codera:openDrop', function(args)
    local dropId = type(args) == 'table' and (args.dropId or (args.args and args.args.dropId)) or args
    if not dropId or cache.vehicle or client.player:get('invOpen') then return end
    client.openInventory('drop', dropId)
end)

AddEventHandler('onClientResourceStart', function(resource)
    if resource ~= 'codera-ui' or not client.drops then return end
    SetTimeout(1000, function()
        for dropId, point in pairs(client.drops) do
            createDropText(dropId, { coords = point.coords })
        end
    end)
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= 'codera-ui' then return end
    drawn = {}
end)

if not Config.health then return end

local parts = { 'Head', 'Chest', 'RArm', 'LArm', 'RKnee', 'LKnee' }
local labels = {
    Head = 'Head', Chest = 'Body', RArm = 'Right Arm', LArm = 'Left Arm',
    RKnee = 'Right Leg', LKnee = 'Left Leg',
}
local boneGroups = {
    RKnee = { 20781, 24806, 52301, 16335, 36864, 51826 },
    LKnee = { 2108, 14201, 35502, 57717, 65245, 23639, 46078, 58271, 63931 },
    Head  = { 1356, 10706, 11174, 12844, 17188, 17719, 19336, 20178, 20279, 20623, 21550, 25260, 27474, 29868, 31086, 35731,
              37193, 39317, 43536, 45750, 46240, 47419, 47495, 49979, 58331, 61839, 64729, 65068 },
    RArm  = { 2992, 6286, 6442, 26610, 26611, 26612, 26613, 26614, 28252, 28422, 37119, 40269, 43810, 57005,
              58866, 58867, 58868, 58869, 58870, 64016, 64017, 64064, 64065, 64080, 64081, 64096, 64097, 64112, 64113 },
    LArm  = { 4089, 4090, 4137, 4138, 4153, 4154, 4169, 4170, 4185, 4186, 5232, 18905, 22711, 36029, 45509, 60309, 61007, 61163 },
    Chest = { 0, 11816, 23553, 24816, 24817, 24818, 56604, 57597 },
}
local boneToPart = {}
for part, bones in pairs(boneGroups) do
    for i = 1, #bones do boneToPart[bones[i]] = part end
end

local damageStep = { Head = 25, Chest = 12, RArm = 10, LArm = 10, RKnee = 10, LKnee = 10 }
local state, hits = {}, 0
local healthOpen = false

local function reset()
    for i = 1, #parts do state[parts[i]] = { health = 100 } end
    hits = 0
end
reset()

for i = 1, #Config.reviveEvents do
    RegisterNetEvent(Config.reviveEvents[i], reset)
end

AddEventHandler('gameEventTriggered', function(name, args)
    if name ~= 'CEventNetworkEntityDamage' then return end
    local victim = args[1]
    if victim ~= cache.ped then return end

    local ok, bone = GetPedLastDamageBone(victim)
    if not ok then return end
    ClearPedLastDamageBone(victim)

    local part = boneToPart[bone]
    if not part then return end

    hits = hits + 1
    local p = state[part]
    p.health = math.max(0, p.health - damageStep[part])
end)

local function openHealth()
    if healthOpen or client.player:get('invOpen') then return end
    healthOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'health',
        data = {
            parts = state,
            injuries = { { label = hits > 0 and ('%d recorded hit(s)'):format(hits) or 'No injuries', count = hits } },
        },
    })
end

RegisterNUICallback('closeHealth', function(_, cb)
    healthOpen = false
    SetNuiFocus(false, false)
    cb(1)
end)

RegisterCommand('oxhealth', openHealth, false)
RegisterKeyMapping('oxhealth', 'Health inspection', 'keyboard', Config.healthKey)
exports('resetHealthState', reset)
