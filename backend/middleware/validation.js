import Joi from "joi";
const orderSchema = Joi.object({
  direction: Joi.string().valid("MMK2THB", "THB2MMK").required(),
  amount: Joi.number().positive().required(),
  bankName: Joi.string().required(),
  accountNo: Joi.string().required(),
  accountName: Joi.string().required(),
  qr_code: Joi.string().optional().allow(''), 
  userAgent: Joi.string().optional()
});
export const validateOrder = (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: "Slip required" });
  const { error } = orderSchema.validate(req.body, { abortEarly: false, allowUnknown: true });
  if (error) return res.status(400).json({ error: error.details[0].message });
  next();
};
