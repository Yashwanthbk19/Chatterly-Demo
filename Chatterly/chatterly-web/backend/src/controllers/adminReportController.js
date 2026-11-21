import Report from "../models/Report.js";

export const getAllReports = async (req, res) => {
  try {

    const reports = await Report.find()
      .populate("reporterId", "name email")
      .populate("reportedUserId", "name email");

    res.status(200).json(reports);

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

export const updateReportStatus = async (req, res) => {
  try {

    const report = await Report.findByIdAndUpdate(
      req.params.id,
      {
        status: req.body.status
      },
      {
        new: true
      }
    );

    res.status(200).json(report);

  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};