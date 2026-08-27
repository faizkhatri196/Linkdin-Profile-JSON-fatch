const linkedinService = require('../services/linkedin/linkedinService');
const { validateProfileRequest } = require('../validators/profileValidator');
const { HTTP_STATUS } = require('../config/constants');

async function getProfile(req, res, next) {
  try {
    // 1. Validate and canonicalize input URL
    const { canonicalUrl, vanityName } = validateProfileRequest(req.body);

    // 2. Execute extraction pipeline
    const result = await linkedinService.getProfile(canonicalUrl);

    // 3. Send structured response
    return res.status(HTTP_STATUS.OK).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getProfile
};
