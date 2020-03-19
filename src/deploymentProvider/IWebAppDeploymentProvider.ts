export interface IWebAppDeploymentProvider {
  PreDeploymentStep(): void
  DeployWebAppStep(): void
  UpdateDeploymentStatus(isDeploymentSuccess: boolean): void
}
