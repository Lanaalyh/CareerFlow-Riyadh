import { Router, type IRouter } from "express";
import healthRouter from "./health";
import careerflowRouter from "./careerflow";

const router: IRouter = Router();

router.use(healthRouter);
router.use(careerflowRouter);

export default router;
