import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    priority:    { type: String, enum: ["low","medium","high","urgent"], default: "medium" },
    status:      { type: String, enum: ["pending","in_progress","in_review","completed","blocked"], default: "pending" },

    assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
    created_by:  { type: mongoose.Schema.Types.ObjectId, ref: "User",     default: null },

    due_date:    { type: Date, default: null },
    start_date:  { type: Date, default: null },
    end_date:    { type: Date, default: null },

    pertOptimistic:  { type: Number, default: null },
    pertMostLikely:  { type: Number, default: null },
    pertPessimistic: { type: Number, default: null },
    pertTime:        { type: Number, default: null },
    pertVariance:    { type: Number, default: null },
    pertSD:          { type: Number, default: null },

    duration:        { type: Number, default: 1 },
    dependencies:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }],

    earlyStart:      { type: Number, default: null },
    earlyFinish:     { type: Number, default: null },
    lateStart:       { type: Number, default: null },
    lateFinish:      { type: Number, default: null },
    float:           { type: Number, default: null },
    isCritical:      { type: Boolean, default: false },

    progress:        { type: Number, min: 0, max: 100, default: 0 },
    project:         { type: String, default: "default" },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

taskSchema.pre("save", async function () {
  const o = this.pertOptimistic;
  const m = this.pertMostLikely;
  const p = this.pertPessimistic;
  if (o != null && m != null && p != null) {
    this.pertTime     = +((o + 4 * m + p) / 6).toFixed(2);
    this.pertVariance = +(((p - o) / 6) ** 2).toFixed(2);
    this.pertSD       = +Math.sqrt(this.pertVariance).toFixed(2);
    if (!this.isModified("duration")) this.duration = this.pertTime;
  }
});

taskSchema.index({ assigned_to: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ project: 1 });
taskSchema.index({ isCritical: 1 });

const Task = mongoose.model("Task", taskSchema);
export default Task;