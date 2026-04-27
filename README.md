# Weather Outfit Feed MVP

오늘 등원 시간대 날씨와 비슷한 지역의 공개 Instagram 게시물을 큐레이션해 보여주는 정적 웹 MVP입니다.

## 기능

- 기준 위치 기본값: 세종시
- Open-Meteo API 기반 등원 시간대(07-09시) 날씨 계산
- 체감온도, 강수, 바람, 습도를 기준으로 비슷한 날씨 지역 매칭
- 공개 Instagram 게시물/릴스 URL 등록
- Instagram 공식 embed.js 기반 게시물 임베드 표시
- 나이대, 비 오는 날, 바람 있는 날 필터
- 등록 게시물은 브라우저 localStorage에 저장

## 실행

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 엽니다.

## 참고

Instagram 전체공개 게시물을 자동 검색하거나 수집하는 기능은 포함하지 않았습니다. 운영 버전에서는 Meta 공식 Instagram Graph API 권한과 앱 심사를 거쳐 해시태그 검색/최근 미디어 API를 연결하는 방향이 안전합니다.
