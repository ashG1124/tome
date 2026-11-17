# apps/server 규칙 (AI 도구용)

루트 `AGENTS.md`를 먼저 따른다. 이 파일은 서버에만 더해지는 규칙이다.

- 구조: `src/modules/<도메인>/` 안에 module·controller·service·repository. controller = HTTP만, service = 규칙·트랜잭션, repository = Prisma 호출만. 다른 모듈은 service로만 부른다.
- 요청·응답 모양은 `packages/shared` zod 스키마만 쓴다. DTO 클래스·class-validator를 만들지 않는다. 검증은 `common/`의 ZodValidationPipe.
- 오류는 `AppError('<ERROR_CODE>')`로만 던진다. 새 오류 코드가 필요하면 멈추고 사람에게 묻는다(shared 변경).
- 동시성은 DB 제약으로 막고, 제약 위반을 오류 코드로 바꾼다.
- 마이그레이션·`packages/shared`·`ai/`·`config/` 변경은 백엔드 리드 승인 없이 하지 않는다. 이미 병합된 마이그레이션 파일은 고치지 않는다.
- `process.env`는 `config/`에서만 읽는다. `.env` 파일을 열거나 출력하지 않는다.
- 로그에 프롬프트 원문·토큰·전시 코드·IP 원문을 남기지 않는다.
- 테스트: Vitest. service 단위 + 엔드포인트 e2e(실제 Postgres, `AI_PROVIDER=mock`). 경계값(개수 상한·글자 수·같은 멱등 키·동시 요청)을 꼭 넣는다.
- PR은 `?template=back.md` 템플릿, 대상 dev.
