const { auth } = require("../../life-drop-client/src/lib/auth"); // তোমার auth file

const verifyAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session) {
      return res.status(401).send({
        success: false,
        message: "Unauthorized",
      });
    }

    req.user = session.user;

    next();
  } catch (err) {
    console.log(err);

    res.status(401).send({
      success: false,
      message: "Unauthorized",
    });
  }
};

module.exports = verifyAuth;
