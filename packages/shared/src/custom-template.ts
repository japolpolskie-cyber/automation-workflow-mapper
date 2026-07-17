import { z } from "zod";
import {
  canonicalWorkflowSchema,
  platformSchema,
  visualGraphSchema,
  workflowSetSchema,
} from "./domain.js";

export const customTemplateSnapshotSchema = z
  .object({
    originalScope: z.string().max(100_000).default(""),
    platform: platformSchema,
    workflow: canonicalWorkflowSchema,
    workflowSet: workflowSetSchema,
    visualGraph: visualGraphSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.workflow.nodes.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A custom template must contain at least one workflow node.",
        path: ["workflow", "nodes"],
      });
    }
  });

export const customTemplateMetadataSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).default(""),
    category: z.string().trim().max(120).default(""),
    tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  })
  .strict();

export const createCustomTemplateSchema = customTemplateMetadataSchema
  .extend({
    snapshot: customTemplateSnapshotSchema,
  })
  .strict();

export const updateCustomTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2_000).optional(),
    category: z.string().trim().max(120).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "Provide at least one template detail to update.",
  });

export const customWorkflowTemplateSchema = customTemplateMetadataSchema
  .extend({
    id: z.string().uuid(),
    snapshot: customTemplateSnapshotSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type CustomTemplateSnapshot = z.infer<
  typeof customTemplateSnapshotSchema
>;
export type CustomTemplateMetadata = z.infer<
  typeof customTemplateMetadataSchema
>;
export type CreateCustomTemplateInput = z.infer<
  typeof createCustomTemplateSchema
>;
export type UpdateCustomTemplateInput = z.infer<
  typeof updateCustomTemplateSchema
>;
export type CustomWorkflowTemplate = z.infer<
  typeof customWorkflowTemplateSchema
>;
