-- CreateTable
CREATE TABLE "QualityIncident" (
    "id" TEXT NOT NULL,
    "reasonKey" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "proofUrl" TEXT,
    "proofName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetUserId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,

    CONSTRAINT "QualityIncident_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "QualityIncident" ADD CONSTRAINT "QualityIncident_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityIncident" ADD CONSTRAINT "QualityIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
