import User from "../models/User.js";

// redis caching
export const getUsers = async (req, res) => {
    try{
        const cacheKey = "users_list";

        // Check redis
        const cached = await getCache(cacheKey);

        if (cached) {
            return res.json({
                source : "Redis",
                data : cached
            });
        }
        
        // Not cached, then fetch from DB
        const users = await User.find();

        // Then store in redis
        await setCache(cacheKey, users, 300);

        res.json({
            source : "Database",
            data : users
        });
    }

    catch (error) {
        res.status(500).json({error : error.message});
    }
};

// Sync contacts
export const syncContacts = async (req, res) => {
    try{
        const {contacts} = req.body;

        if (!contacts || !Array.isArray(contacts)){
            return res.status(400).json({message : "Contacts must be array"});
        }

        // Normalize contacts to +91 format
        const normalizedNumbers = contacts.map((num) => {
        const digits = num.replace(/\D/g, "");
        const last10 = digits.slice(-10);
        return "+91" + last10;
        });

        // Remove duplicates
        const uniqueNumbers = [...new Set(normalizedNumbers)];

        // Find matching users
        const registeredUsers = await User.find({
        phone: { $in: normalizedNumbers },
        });

        const registeredNumbers = registeredUsers.map((u) => u.phone);

        // Find unregistered numbers
        const unRegistered = uniqueNumbers.filter((num) => 
        !registeredNumbers.includes(num));

        return res.status(200).json({
            message : "Contact sync is successful",
            registered : registeredUsers,
            unRegistered,
        });
    }

    catch (error) {
        console.error("Contact sync error : error");
        res.status(500).json({ error: error.message });
    }
};

