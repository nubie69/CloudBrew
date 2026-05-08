const crypto = require('crypto');

module.exports = function createAdminRecoveryHandler(deps) {
  const {
    Staff,
    PasswordResetToken,
    normalizeEmail,
    isValidEmail,
    sendAdminResetEmail,
    buildAdminResetLink,
    writeAuditLog,
    createHttpError,
    hashPasswordResetToken,
    generateId,
    resetTokenTtlMs,
  } = deps;

  return async function adminRecoveryHandler(req, res, next) {
    try {
      const { email } = req.body || {};
      const normalizedEmail = normalizeEmail(email);

      if (!isValidEmail(normalizedEmail)) {
        return res.status(404).json({ message: 'Email is not existed' });
      }

      const staffMember = await Staff.findOne(
        {
          role: 'admin',
          active: true,
          $or: [{ email: normalizedEmail }, { recoveryEmail: normalizedEmail }],
        },
        { _id: 0, id: 1, name: 1, email: 1, recoveryEmail: 1 }
      ).lean();

      if (!staffMember) {
        return res.status(404).json({ message: 'Email is not existed' });
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashPasswordResetToken(rawToken);
      const expiresAt = new Date(Date.now() + resetTokenTtlMs);

      await PasswordResetToken.deleteMany({ adminId: staffMember.id });
      await PasswordResetToken.create({
        id: generateId('RTK'),
        adminId: staffMember.id,
        tokenHash,
        expiresAt,
      });

      const resetLink = buildAdminResetLink(rawToken, req);

      try {
        if (!isValidEmail(staffMember.recoveryEmail)) {
          throw createHttpError(404, 'Email is not existed');
        }

        await sendAdminResetEmail(staffMember.recoveryEmail, resetLink);
      } catch (mailError) {
        if (mailError?.status === 404) {
          return res.status(404).json({ message: 'Email is not existed' });
        }

        console.error('Failed to send admin reset email:', mailError?.message || mailError);
        return res.status(500).json({ message: 'Unable to send reset link right now.' });
      }

      await writeAuditLog('ADMIN_PASSWORD_RESET_REQUEST', staffMember.name, `Reset link issued for ${staffMember.email}`);

      return res.json({ message: 'Reset link sent' });
    } catch (error) {
      return next(error);
    }
  };
};