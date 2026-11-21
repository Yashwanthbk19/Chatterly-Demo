import Bug from "../models/Bug.js";

export const createBug = async (bugData) => {
    const lastBug = await Bug.findOne()
        .sort({id: -1})
        .select("id");
    const nextId = lastBug ? lastBug.id + 1 : 1;

    return await Bug.create({
        id: nextId,
        ...bugData,
    });
};

export const getAllBugs = async () => {
    return await Bug.find().sort({id: -1});
};

export const getBugsBySeverity = async (severity) => {
    return await Bug.find({severity}).sort({id: -1});
};

export const assignDeveloper = async (
    bugId,
    assignedDeveloper
) => {
    return await Bug.findOneAndUpdate(
        { id: bugId },
        {
            assignedDeveloper,
            status: "In Progress",
        },
        {
            returnDocument: "after",
        }
    );
};

export const resolveBug = async (bugId) => {
    return await Bug.findOneAndUpdate(
        { id: bugId },
        {
            status: "Resolved",
            resolvedAt: new Date(),
        },
        {
            returnDocument: "after",
        }
    );
};