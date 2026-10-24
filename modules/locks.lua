local locks = {}

local lock = {
    __metatable = "Lock",
}

function lock:__close()
    for i = 1, #self do
        locks[self[i]] = nil
    end
end

local function GetLocks(obj)
    for i = 1, #obj do
        local id = obj[i]

        if locks[id] then return false end
    end

    for i = 1, #obj do
        locks[obj[i]] = true
    end

    return setmetatable(obj, lock)
end

return GetLocks
