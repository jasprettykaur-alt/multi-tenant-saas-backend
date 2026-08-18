import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  declare projectId?: string;
}
