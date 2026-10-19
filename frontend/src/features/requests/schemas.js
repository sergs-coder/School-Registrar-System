import { z } from 'zod'

const PH_MOBILE = /^(\+63|0)9\d{9}$/

/** Builds the Zod schema for step 1 from the document type's admin-defined fields. */
export function buildDetailsSchema(docType) {
  const formShape = {}
  for (const f of docType.required_fields) {
    let s
    switch (f.type) {
      case 'number':
        s = z
          .union([z.string(), z.number()])
          .transform((v) => (v === '' || v == null ? undefined : Number(v)))
          .refine((v) => v === undefined || Number.isInteger(v), `${f.label} must be a whole number.`)
        if (f.required) s = s.refine((v) => v !== undefined, `${f.label} is required.`)
        break
      case 'checkbox':
        s = z.boolean().optional()
        if (f.required) s = z.literal(true, { error: `Please confirm: ${f.label}` })
        break
      case 'select':
        s = f.required
          ? z.string({ error: `Please choose ${f.label.toLowerCase()}.` }).min(1, `Please choose ${f.label.toLowerCase()}.`)
          : z.string().optional()
        break
      default: {
        const max = f.max_length ?? 1000
        s = z.string().trim().max(max, `Keep this under ${max} characters.`)
        s = f.required ? s.min(1, `${f.label} is required.`) : s.optional()
      }
    }
    formShape[f.key] = s
  }

  return z
    .object({
      purposeChoice: z.string({ error: 'Please choose a purpose.' }).min(1, 'Please choose a purpose.'),
      purposeOther: z.string().trim().max(250, 'Keep this under 250 characters.').optional(),
      copies: z.coerce
        .number()
        .int()
        .min(1, 'At least 1 copy.')
        .max(docType.max_copies, `You can request up to ${docType.max_copies}.`),
      form_data: z.object(formShape),
    })
    .superRefine((v, ctx) => {
      if (v.purposeChoice === '__other__' && !v.purposeOther) {
        ctx.addIssue({ code: 'custom', path: ['purposeOther'], message: 'Please describe the purpose.' })
      }
    })
}

export const addressSchema = z
  .object({
    recipient: z.string().trim().min(2, 'Enter the recipient’s full name.').max(150),
    contact_no: z.string().trim().regex(PH_MOBILE, 'Use a PH mobile number, e.g. 09171234567.'),
    region: z.enum(['metro', 'provincial']),
    // Metro Manila: chosen from lists; the province is filled in by the server.
    city: z.string().trim().min(2, 'Choose or enter the city or municipality.').max(100),
    barangay: z.string().optional(),
    province: z.string().trim().max(100).optional(),
    line1: z.string().trim().min(3, 'Enter the house no. and street.').max(250),
    zip: z.string().trim().regex(/^\d{4}$/, 'ZIP codes have 4 digits.'),
    landmark: z.string().trim().max(200, 'Keep this under 200 characters.').optional(),
  })
  .superRefine((a, ctx) => {
    if (a.region === 'metro' && !a.barangay) {
      ctx.addIssue({ code: 'custom', path: ['barangay'], message: 'Choose the barangay.' })
    }
    if (a.region === 'provincial' && (a.province ?? '').length < 2) {
      ctx.addIssue({ code: 'custom', path: ['province'], message: 'Enter the province.' })
    }
  })

export const deliverySchema = z.discriminatedUnion('delivery_method', [
  z.object({ delivery_method: z.literal('pickup') }),
  z.object({ delivery_method: z.literal('courier'), delivery_address: addressSchema }),
])
