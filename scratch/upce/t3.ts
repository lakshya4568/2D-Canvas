import { evaluatePerpendicularConstraint, evaluateParallelConstraint } from "../../lib/solver/jacobians/analyticalJacobians";

// Two edges sharing vertex v1: e0 = v0->v1, e1 = v1->v2
const X = [0,0, 4000,0, 4000,2400];
const f = (Xv: number[]) => {
  const [x1,y1,x2,y2,x3,y3] = Xv;
  // perpendicular(e0=(p0,p1), e1=(p1,p2)) = (x2-x1)(x3-x2)+(y2-y1)(y3-y2)
  return (x2-x1)*(x3-x2)+(y2-y1)*(y3-y2);
};
const h = 1e-4;
const fd = X.map((_, i) => { const a=[...X],b=[...X]; a[i]+=h; b[i]-=h; return (f(a)-f(b))/(2*h); });
const an = evaluatePerpendicularConstraint(X, 0, 1, 1, 2).jacobian[0];
console.log("finite diff :", fd.map(v=>v.toFixed(2)).join(" "));
console.log("analytical  :", an.map(v=>v.toFixed(2)).join(" "));
console.log("MATCH:", fd.every((v,i)=>Math.abs(v-an[i])<1e-3));
