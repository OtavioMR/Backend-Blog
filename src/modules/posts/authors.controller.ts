import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPublicRoute } from '../../docs/decorators/public.decorator.js';
import { PostsService } from './posts.service.js';

@ApiTags('Autores')
@Controller('authors')
export class AuthorsController {
  constructor(private readonly posts: PostsService) {}
  @Get(':id')
  @ApiPublicRoute()
  @ApiOperation({ summary: 'Perfil público do autor', description: 'Informe o UUID retornado em author.id de um artigo. Retorna nome, foto, biografia, links públicos e a quantidade de artigos ativos publicados; rascunhos não entram na contagem. Somente usuários ativos com perfil AUTHOR, ADMIN ou SUPER_ADMIN possuem perfil público. Não requer autenticação.' })
  @ApiParam({ name: 'id', description: 'UUID do usuário autor ou administrador.', format: 'uuid', example: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22' })
  @ApiResponse({ status: 200, description: 'Perfil público.', schema: { example: { id: 'b1ffcd88-8b1a-4ce7-aa5c-5cc8ac271b22', name: 'Ana', profilePhoto: null, bio: 'Autora', websiteUrl: 'https://example.com', socialUrl: null, publicationCount: 2 } } })
  @ApiResponse({ status: 400, description: 'UUID inválido.' })
  @ApiResponse({ status: 404, description: 'Autor não encontrado.' })
  profile(@Param('id', ParseUUIDPipe) id: string) { return this.posts.authorProfile(id); }
}
