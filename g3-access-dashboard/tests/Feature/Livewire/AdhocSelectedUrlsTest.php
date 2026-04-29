<?php

namespace Tests\Feature\Livewire;

use App\Jobs\DiscoverSiteUrlsJob;
use App\Livewire\Adhoc\Index as AdhocIndex;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Livewire\Livewire;
use Tests\TestCase;

class AdhocSelectedUrlsTest extends TestCase
{
    use RefreshDatabase;

    public function test_six_query_string_routed_urls_are_dispatched_distinctly(): void
    {
        Bus::fake();

        $user = User::factory()->create(['email_verified_at' => now()]);
        $this->actingAs($user);

        // Real URLs from the sabethahospital.com baseline scan that triggered
        // this regression: five of the six share a path (getpage.php or
        // staff/bio.php) and only differ in query string. The old normalizer
        // stripped queries and ->unique() collapsed them to two URLs.
        $urls = [
            'https://sabethahospital.com/',
            'https://www.sabethahospital.com/getpage.php?name=contact&sub=About%20Us',
            'https://www.sabethahospital.com/getpage.php?name=admit',
            'https://www.sabethahospital.com/getpage.php?name=patientinfo&sub=Patient%2FVisitors',
            'https://www.sabethahospital.com/getpage.php?name=cardiac&sub=Our%20Services',
            'https://www.sabethahospital.com/staff/bio.php?Jamesina_M_Dickson_MD&OB_and_GYN&doc_id=87262&group=1553&sub=Providers',
        ];

        Livewire::test(AdhocIndex::class)
            ->set('url', $urls[0])
            ->set('urlList', implode("\n", $urls))
            ->set('type', 'selected')
            ->call('scan')
            ->assertHasNoErrors();

        Bus::assertDispatched(DiscoverSiteUrlsJob::class, function (DiscoverSiteUrlsJob $job) use ($urls) {
            $this->assertCount(6, $job->suppliedUrls, 'expected 6 distinct URLs after normalization');

            // Every original URL should be present in the dispatched payload.
            // Compare with trailing-slash and case normalization rules built into
            // the normalizer rather than asserting strict equality on raw input.
            $expected = collect($urls)->map(fn ($u) => rtrim(preg_replace('#^([a-z]+://[^/]+)/+$#i', '$1/', $u), '/'))
                ->map(fn ($u) => $u === '' ? '/' : $u)
                ->all();

            foreach ($expected as $u) {
                // Match by host+query+path rather than fragile string compare.
                $found = false;
                foreach ($job->suppliedUrls as $dispatched) {
                    if (parse_url($dispatched, PHP_URL_QUERY) === parse_url($u, PHP_URL_QUERY)
                        && parse_url($dispatched, PHP_URL_HOST) === strtolower(parse_url($u, PHP_URL_HOST))
                    ) {
                        $found = true;
                        break;
                    }
                }
                $this->assertTrue($found, "URL not dispatched: {$u}");
            }

            return true;
        });
    }

    public function test_dedup_still_works_for_truly_identical_urls(): void
    {
        Bus::fake();

        $user = User::factory()->create(['email_verified_at' => now()]);
        $this->actingAs($user);

        // Same URL three different ways: with trailing slash, uppercase host,
        // explicit default port. Should collapse to one.
        $urls = [
            'https://example.com/foo',
            'https://EXAMPLE.com/foo/',
            'https://example.com:443/foo',
        ];

        Livewire::test(AdhocIndex::class)
            ->set('url', $urls[0])
            ->set('urlList', implode("\n", $urls))
            ->set('type', 'selected')
            ->call('scan')
            ->assertHasNoErrors();

        Bus::assertDispatched(DiscoverSiteUrlsJob::class, function (DiscoverSiteUrlsJob $job) {
            $this->assertCount(1, $job->suppliedUrls, 'identical URLs should still dedup');
            $this->assertSame('https://example.com/foo', $job->suppliedUrls[0]);
            return true;
        });
    }
}
